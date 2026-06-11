import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { buildValueReportEmail, sendRetentionEmail, resolveOwnerContact } from "@/lib/retentionEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron Job (día 1 de cada mes) — reporte de valor mensual.
 *
 * Para cada sitio con statusPago "activo": calcula el delta del mes
 * (contadores acumulativos actuales − statsSnapshot del mes anterior) y
 * manda el email "Este mes INDEXA le trajo N contactos a {negocio}".
 *
 * Es el ancla anti-churn: el cliente ve en números qué recibió por su
 * mensualidad ANTES de cuestionarse si renovar.
 *
 * Primera corrida (sin snapshot): reporta acumulados ("desde que empezaste").
 * Si el delta del mes es 0 en todo, NO se manda email (recordarle al cliente
 * que pagó por nada es un disparador de cancelación) — pero el snapshot sí
 * se actualiza para que el próximo mes el delta sea real.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DAYS_BETWEEN_REPORTS = 25;

interface BioClicksShape {
  [linkId: string]: { [source: string]: number };
}

function sumBioClicks(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const clicks = (raw as { clicks?: BioClicksShape }).clicks;
  if (!clicks || typeof clicks !== "object") return 0;
  let total = 0;
  for (const linkClicks of Object.values(clicks)) {
    if (!linkClicks || typeof linkClicks !== "object") continue;
    for (const n of Object.values(linkClicks)) {
      if (typeof n === "number" && Number.isFinite(n)) total += n;
    }
  }
  return total;
}

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
    console.error("CRON monthly-report: Firebase Admin no inicializado:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Firebase Admin no inicializado" }, { status: 500 });
  }

  let sent = 0;
  let skippedZero = 0;
  let skippedRecent = 0;
  let skippedNoContact = 0;

  try {
    const snap = await db
      .collection("sitios")
      .where("statusPago", "==", "activo")
      .limit(500)
      .get();

    const now = Date.now();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();

      // Guard: no repetir reporte si ya se mandó hace < 25 días
      const lastReport =
        typeof data.lastValueReportAt === "string" ? new Date(data.lastValueReportAt).getTime() : NaN;
      if (!Number.isNaN(lastReport) && now - lastReport < MIN_DAYS_BETWEEN_REPORTS * DAY_MS) {
        skippedRecent++;
        continue;
      }

      // Contadores acumulativos actuales
      const vistas = typeof data.vistas === "number" ? data.vistas : 0;
      const clics = typeof data.clicsWhatsApp === "number" ? data.clicsWhatsApp : 0;
      const bioClicks = sumBioClicks(data.bioStats);

      // Delta vs snapshot del mes anterior
      const snapPrev = (data.statsSnapshot || null) as {
        vistas?: number;
        clicsWhatsApp?: number;
        bioClicks?: number;
      } | null;
      const esPrimerReporte = !snapPrev;
      const vistasMes = esPrimerReporte ? vistas : Math.max(0, vistas - (snapPrev?.vistas ?? 0));
      const clicsMes = esPrimerReporte ? clics : Math.max(0, clics - (snapPrev?.clicsWhatsApp ?? 0));
      const bioClicksMes = esPrimerReporte ? bioClicks : Math.max(0, bioClicks - (snapPrev?.bioClicks ?? 0));

      const newSnapshot = {
        statsSnapshot: {
          vistas,
          clicsWhatsApp: clics,
          bioClicks,
          takenAt: new Date().toISOString(),
        },
      };

      // Mes en ceros → actualizar snapshot sin email
      if (vistasMes + clicsMes + bioClicksMes === 0) {
        await docSnap.ref.set(
          { ...newSnapshot, lastValueReportAt: new Date().toISOString() },
          { merge: true }
        );
        skippedZero++;
        continue;
      }

      const contact = await resolveOwnerContact({
        ownerId: typeof data.ownerId === "string" ? data.ownerId : undefined,
        email: typeof data.email === "string" ? data.email : undefined,
        nombre: typeof data.nombre === "string" ? data.nombre : undefined,
      });
      if (!contact) {
        skippedNoContact++;
        continue;
      }

      const ok = await sendRetentionEmail(
        contact.email,
        buildValueReportEmail({
          nombre: contact.nombre,
          negocio: typeof data.nombre === "string" ? data.nombre : "",
          vistasMes,
          clicsMes,
          bioClicksMes,
          esPrimerReporte,
        })
      );
      if (ok) {
        await docSnap.ref.set(
          { ...newSnapshot, lastValueReportAt: new Date().toISOString() },
          { merge: true }
        );
        sent++;
      }
    }

    return NextResponse.json({
      success: true,
      checked: snap.size,
      sent,
      skippedZero,
      skippedRecent,
      skippedNoContact,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("CRON monthly-report error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Cron failed." }, { status: 500 });
  }
}
