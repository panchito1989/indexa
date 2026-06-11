import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  sendTemplateMessage,
  buildBodyParams,
  normalizePhoneByCountry,
} from "@/lib/whatsapp";
import {
  getPresetByStage,
  renderPreset,
  presetToBodyVars,
} from "@/lib/outreachPresetsUsa";
import {
  STEP_TO_STAGE,
  markStepSent,
  stopSequence,
  bumpMetric,
  type SeqStep,
} from "@/lib/outreachSequence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron Job — seguimiento automático del outreach USA-Hispano.
 *
 * Diario: busca prospectos con un paso de secuencia vencido (wa_seq_next_at
 * <= ahora) que NO han respondido ni pedido BAJA, y envía (o encola) el
 * siguiente follow-up: d2 → d5 → d10.
 *
 * Modos (env OUTREACH_FOLLOWUP_MODE):
 *   - "manual" (default): renderiza el preset y lo deja en la colección
 *     outreach_queue como link wa.me listo para que el operador lo mande
 *     desde /admin/outreach-usa. No requiere templates aprobados por Meta.
 *   - "auto": envía el template de Meta del preset (metaTemplateName) vía
 *     Cloud API. Requiere que Meta haya aprobado los templates.
 *   - "hybrid": d2 automático, d5/d10 a cola manual.
 *
 * Protecciones: cap diario (OUTREACH_DAILY_CAP, default 30), throttle 800ms,
 * y ante errores 131049/131050 de Meta (límite de marketing por usuario) el
 * paso NO avanza — se reintenta al día siguiente.
 */

type FollowupMode = "manual" | "auto" | "hybrid";

const VALID_STEPS: SeqStep[] = ["d2", "d5", "d10"];
const DELAY_MS = 800;
const RATE_LIMIT_CODES = new Set([131049, 131050]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getMode(): FollowupMode {
  const raw = (process.env.OUTREACH_FOLLOWUP_MODE || "manual").toLowerCase();
  return raw === "auto" || raw === "hybrid" ? (raw as FollowupMode) : "manual";
}

function getDailyCap(): number {
  const raw = Number(process.env.OUTREACH_DAILY_CAP);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
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
    console.error("CRON outreach-followups: Firebase Admin no inicializado:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Firebase Admin no inicializado" }, { status: 500 });
  }

  const mode = getMode();
  const cap = getDailyCap();

  let sentAuto = 0;
  let queued = 0;
  let stopped = 0;
  let skipped = 0;
  let rateLimited = 0;
  let failed = 0;

  try {
    const snap = await db
      .collection("prospectos_frios")
      .where("wa_seq_next_at", "<=", Timestamp.now())
      .limit(cap)
      .get();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const ref = docSnap.ref;

      // ── Salidas permanentes: opt-out, vendido/rechazado ──
      if (data.wa_opted_out === true) {
        await stopSequence(ref, "opted_out");
        stopped++;
        continue;
      }
      if (data.status === "vendido" || data.status === "rechazado") {
        await ref.set(
          { wa_seq_next_at: FieldValue.delete(), wa_seq_next_step: null },
          { merge: true }
        );
        skipped++;
        continue;
      }

      // ── Si respondió después del último paso, detener (cinturón y
      //    tirantes — el webhook ya debió hacerlo) ──
      const lastInbound = data.wa_last_inbound_at as Timestamp | undefined;
      const lastStep = data.wa_seq_last_step_at as Timestamp | undefined;
      if (lastInbound && (!lastStep || lastInbound.toMillis() > lastStep.toMillis())) {
        await stopSequence(ref, "replied");
        stopped++;
        continue;
      }

      const step = data.wa_seq_next_step as SeqStep | undefined;
      if (!step || !VALID_STEPS.includes(step)) {
        await ref.set(
          { wa_seq_next_at: FieldValue.delete(), wa_seq_next_step: null },
          { merge: true }
        );
        skipped++;
        continue;
      }

      const preset = getPresetByStage(STEP_TO_STAGE[step], "generico", "v2");
      if (!preset) {
        skipped++;
        continue;
      }

      const nombre = typeof data.nombre === "string" ? data.nombre : "";
      const ciudad = typeof data.ciudad === "string" ? data.ciudad : "";
      const vars = { nombre, negocio: nombre, ciudad };

      const { phone, country } = normalizePhoneByCountry(
        typeof data.telefono === "string" ? data.telefono : "",
        { ciudad, pais: typeof data.wa_country === "string" ? data.wa_country : "US" }
      );
      if (!phone) {
        await ref.set(
          { wa_seq_next_at: FieldValue.delete(), wa_seq_next_step: null },
          { merge: true }
        );
        skipped++;
        continue;
      }

      const autoThisStep =
        mode === "auto" || (mode === "hybrid" && step === "d2");

      // ── Envío automático vía template de Meta ──
      if (autoThisStep && preset.metaTemplateName) {
        const r = await sendTemplateMessage({
          to: phone,
          templateName: preset.metaTemplateName,
          languageCode: preset.metaTemplateLang || "es",
          bodyParams: buildBodyParams(presetToBodyVars(preset, vars)),
          country,
        });

        if (r.success) {
          await ref.set(
            {
              wa_status: "sent",
              wa_message_id: r.messageId || "",
              wa_template: preset.metaTemplateName,
              wa_last_outreach_preset: preset.id,
              wa_last_outreach_stage: preset.stage,
              wa_last_outreach_at: FieldValue.serverTimestamp(),
              wa_last_outreach_mode: "template",
            },
            { merge: true }
          );
          await markStepSent(ref, step);
          await bumpMetric(preset.id, "sent");
          sentAuto++;
        } else if (r.errorCode && RATE_LIMIT_CODES.has(r.errorCode)) {
          // Límite de marketing por usuario — NO avanzar; el próximo run
          // del cron lo reintenta (wa_seq_next_at queda en el pasado).
          rateLimited++;
        } else {
          await ref.set(
            {
              wa_status: "failed",
              wa_last_error: r.error || "unknown",
              wa_last_attempt_at: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          // Avanzamos igual para no reintentar un número roto eternamente.
          await markStepSent(ref, step);
          await bumpMetric(preset.id, "failed");
          failed++;
        }

        await sleep(DELAY_MS);
        continue;
      }

      // ── Modo manual: encolar wa.me link para envío asistido ──
      const renderedText = renderPreset(preset, vars);
      const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(renderedText)}`;

      await db.collection("outreach_queue").add({
        prospectoId: docSnap.id,
        nombre,
        ciudad,
        telefono: phone,
        presetId: preset.id,
        step,
        stage: preset.stage,
        renderedText,
        waLink,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
      });

      await ref.set(
        {
          wa_last_outreach_preset: preset.id,
          wa_last_outreach_stage: preset.stage,
          wa_last_outreach_at: FieldValue.serverTimestamp(),
          wa_last_outreach_mode: "link",
        },
        { merge: true }
      );
      // Avanza el estado al encolar para no re-encolar el mismo paso mañana.
      // "sent" se cuenta aquí (mejor aproximación en flujo manual).
      await markStepSent(ref, step);
      await bumpMetric(preset.id, "sent");
      queued++;
    }

    return NextResponse.json({
      success: true,
      mode,
      cap,
      processed: snap.size,
      sentAuto,
      queued,
      stopped,
      skipped,
      rateLimited,
      failed,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("CRON outreach-followups error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Cron failed." }, { status: 500 });
  }
}
