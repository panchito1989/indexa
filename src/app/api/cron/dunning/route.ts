import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { buildDunningEmail, sendRetentionEmail, resolveOwnerContact } from "@/lib/retentionEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron Job (diario) — dunning de pagos fallidos, toques #2 y #3.
 *
 * El toque #1 lo manda el webhook de Stripe al instante del primer fallo
 * (invoice.payment_failed → sendDunningFirstTouch). Este cron continúa:
 *   - Día 3 sin resolver → email #2 ("quedan 4 días")
 *   - Día 7 sin resolver → email #3 ("aviso final")
 *
 * El "pausado" del sitio sigue siendo el comportamiento existente del
 * status "vencido" — este cron solo comunica, no cambia statusPago.
 * Si el pago pasa, renewSitio limpia los campos dunning* y el ciclo cierra.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://indexaia.com";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let db;
  try {
    db = getAdminDb();
  } catch (err) {
    console.error("CRON dunning: Firebase Admin no inicializado:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Firebase Admin no inicializado" }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  const results: Array<{ sitioId: string; step: number }> = [];

  try {
    const snap = await db
      .collection("sitios")
      .where("statusPago", "==", "vencido")
      .limit(200)
      .get();

    const now = Date.now();
    const payUrl = `${SITE_URL}/dashboard`;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const emailsSent = typeof data.dunningEmailsSent === "number" ? data.dunningEmailsSent : 0;

      // Punto de partida del ciclo: dunningFirstFailedAt (webhook) o
      // vencidoAt como respaldo. Sitios "vencido" legacy sin fecha → skip
      // (no queremos resucitar cadáveres de hace meses con un "quedan 4 días").
      const firstFailedRaw =
        (typeof data.dunningFirstFailedAt === "string" && data.dunningFirstFailedAt) ||
        (typeof data.vencidoAt === "string" && data.vencidoAt) ||
        "";
      if (!firstFailedRaw) {
        skipped++;
        continue;
      }
      const firstFailed = new Date(firstFailedRaw).getTime();
      if (Number.isNaN(firstFailed)) {
        skipped++;
        continue;
      }
      const days = Math.floor((now - firstFailed) / DAY_MS);
      // Ciclos viejos (>30 días) ya son territorio de win-back, no de dunning.
      if (days > 30) {
        skipped++;
        continue;
      }

      let step: 1 | 2 | 3 | null = null;
      if (days >= 7 && emailsSent === 2) step = 3;
      else if (days >= 3 && emailsSent === 1) step = 2;
      else if (emailsSent === 0) step = 1; // el webhook no alcanzó a mandarlo

      if (!step) {
        skipped++;
        continue;
      }

      const contact = await resolveOwnerContact({
        ownerId: typeof data.ownerId === "string" ? data.ownerId : undefined,
        email: typeof data.email === "string" ? data.email : undefined,
        nombre: typeof data.nombre === "string" ? data.nombre : undefined,
      });
      if (!contact) {
        skipped++;
        continue;
      }

      const ok = await sendRetentionEmail(
        contact.email,
        buildDunningEmail(step, {
          nombre: contact.nombre,
          negocio: typeof data.nombre === "string" ? data.nombre : "",
          payUrl,
        })
      );
      if (ok) {
        await docSnap.ref.set(
          {
            dunningEmailsSent: step,
            dunningLastEmailAt: new Date().toISOString(),
            ...(emailsSent === 0 && !data.dunningFirstFailedAt
              ? { dunningFirstFailedAt: firstFailedRaw }
              : {}),
          },
          { merge: true }
        );
        sent++;
        results.push({ sitioId: docSnap.id, step });
      }
    }

    return NextResponse.json({
      success: true,
      checked: snap.size,
      sent,
      skipped,
      results,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("CRON dunning error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Cron failed." }, { status: 500 });
  }
}
