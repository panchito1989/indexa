import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { buildWinbackEmail, sendRetentionEmail, resolveOwnerContact } from "@/lib/retentionEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron Job (diario) — win-back de clientes cancelados/vencidos.
 *
 * Ventana: entre 7 y 30 días después de cancelar o vencer (ya pasó el enojo,
 * todavía recuerdan el producto). Oferta: garantía DOBLE (60 días) al volver.
 * Un solo toque por cliente (winbackSentAt lo marca; renewSitio lo limpia
 * si reactivan, por si en el futuro vuelven a cancelar).
 *
 * Fecha de referencia: canceladoAt / vencidoAt; fallback para docs viejos:
 * ultimoPagoAt + 30 días.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DAYS = 7;
const MAX_DAYS = 30;

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
    console.error("CRON winback: Firebase Admin no inicializado:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Firebase Admin no inicializado" }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  try {
    const snap = await db
      .collection("sitios")
      .where("statusPago", "in", ["cancelado", "vencido"])
      .limit(500)
      .get();

    const now = Date.now();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (data.winbackSentAt) {
        skipped++;
        continue;
      }

      // Fecha de referencia del churn
      let refRaw =
        (typeof data.canceladoAt === "string" && data.canceladoAt) ||
        (typeof data.vencidoAt === "string" && data.vencidoAt) ||
        "";
      if (!refRaw && typeof data.ultimoPagoAt === "string") {
        const lastPay = new Date(data.ultimoPagoAt).getTime();
        if (!Number.isNaN(lastPay)) {
          refRaw = new Date(lastPay + 30 * DAY_MS).toISOString();
        }
      }
      if (!refRaw) {
        skipped++;
        continue;
      }
      const refTime = new Date(refRaw).getTime();
      if (Number.isNaN(refTime)) {
        skipped++;
        continue;
      }

      const days = Math.floor((now - refTime) / DAY_MS);
      if (days < MIN_DAYS || days > MAX_DAYS) {
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
        buildWinbackEmail({
          nombre: contact.nombre,
          negocio: typeof data.nombre === "string" ? data.nombre : "",
        })
      );
      if (ok) {
        await docSnap.ref.set(
          { winbackSentAt: new Date().toISOString() },
          { merge: true }
        );
        sent++;
      }
    }

    return NextResponse.json({
      success: true,
      checked: snap.size,
      sent,
      skipped,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("CRON winback error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Cron failed." }, { status: 500 });
  }
}
