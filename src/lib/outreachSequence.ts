/**
 * Máquina de estados del seguimiento automático de outreach USA-Hispano.
 *
 * Ciclo de vida (campos wa_seq_* en prospectos_frios):
 *
 *   opener_sent ──(+2d)──> d2_sent ──(+3d)──> d5_sent ──(+5d)──> exhausted
 *        │                    │                  │        (tras enviar d10)
 *        └────────────────────┴──────────────────┴──> replied / opted_out
 *
 * - El enrolamiento ocurre al enviar el cold opener (outreach-usa o
 *   whatsapp-masivo con país US).
 * - El cron /api/cron/outreach-followups consume wa_seq_next_at para saber
 *   qué prospectos tienen un paso vencido y envía (o encola) el siguiente.
 * - El webhook de WhatsApp llama stopSequence() cuando el prospecto responde
 *   (replied) o manda BAJA (opted_out) — nunca se persigue a quien ya habló.
 *
 * Métricas: outreach_metrics/{presetId}_{YYYYMM} acumula sent/delivered/read/
 * replied/opted_out/failed por preset y mes, para saber qué copy convierte.
 */

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { DocumentReference } from "firebase-admin/firestore";
import { getAdminDb } from "./firebaseAdmin";
import type { OutreachStage } from "./outreachPresetsUsa";

export type SeqStage =
  | "opener_sent"
  | "d2_sent"
  | "d5_sent"
  | "exhausted"
  | "replied"
  | "opted_out";

export type SeqStep = "d2" | "d5" | "d10";
export type SeqMode = "auto" | "manual";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Delay del opener al primer follow-up. */
const OPENER_TO_D2_DAYS = 2;

/** Qué sigue después de enviar cada step, y con cuánto delay. */
const NEXT_AFTER: Record<SeqStep, { step: SeqStep | null; delayDays: number }> = {
  d2: { step: "d5", delayDays: 3 },
  d5: { step: "d10", delayDays: 5 },
  d10: { step: null, delayDays: 0 },
};

/** Mapa step de secuencia → stage de preset (para getPresetByStage). */
export const STEP_TO_STAGE: Record<SeqStep, OutreachStage> = {
  d2: "no_reply_followup_2d",
  d5: "no_reply_followup_5d",
  d10: "no_reply_followup_10d",
};

/** Estados en los que la secuencia sigue viva (el cron puede actuar). */
export function isActiveSeqStage(stage: unknown): boolean {
  return stage === "opener_sent" || stage === "d2_sent" || stage === "d5_sent";
}

/**
 * Enrola un prospecto en la secuencia al enviarle el cold opener.
 * Idempotente vía merge: re-enviar el opener reinicia el reloj.
 */
export async function enrollProspect(
  ref: DocumentReference,
  opts: { presetId: string; mode: SeqMode; version?: "v1" | "v2" }
): Promise<void> {
  await ref.set(
    {
      wa_seq_stage: "opener_sent",
      wa_seq_next_step: "d2",
      wa_seq_next_at: Timestamp.fromMillis(Date.now() + OPENER_TO_D2_DAYS * DAY_MS),
      wa_seq_enrolled_at: FieldValue.serverTimestamp(),
      wa_seq_last_step_at: FieldValue.serverTimestamp(),
      wa_seq_mode: opts.mode,
      wa_seq_version: opts.version || "v2",
      wa_seq_opener_preset: opts.presetId,
    },
    { merge: true }
  );
}

/**
 * Marca un step de follow-up como enviado y agenda el siguiente.
 * Tras d10 no queda nada por enviar → "exhausted" y sin wa_seq_next_at
 * (sale de la query del cron).
 */
export async function markStepSent(ref: DocumentReference, step: SeqStep): Promise<void> {
  const next = NEXT_AFTER[step];
  const update: Record<string, unknown> = {
    wa_seq_last_step_at: FieldValue.serverTimestamp(),
  };
  if (next.step) {
    update.wa_seq_stage = `${step}_sent`;
    update.wa_seq_next_step = next.step;
    update.wa_seq_next_at = Timestamp.fromMillis(Date.now() + next.delayDays * DAY_MS);
  } else {
    update.wa_seq_stage = "exhausted";
    update.wa_seq_next_step = null;
    update.wa_seq_next_at = FieldValue.delete();
  }
  await ref.set(update, { merge: true });
}

/**
 * Detiene la secuencia: el prospecto respondió o pidió BAJA.
 * Quita wa_seq_next_at para que el cron deje de verlo.
 */
export async function stopSequence(
  ref: DocumentReference,
  reason: "replied" | "opted_out"
): Promise<void> {
  await ref.set(
    {
      wa_seq_stage: reason,
      wa_seq_next_step: null,
      wa_seq_next_at: FieldValue.delete(),
      wa_seq_stopped_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export type MetricField =
  | "sent"
  | "delivered"
  | "read"
  | "replied"
  | "opted_out"
  | "failed";

/**
 * Incrementa un contador de outreach_metrics/{presetId}_{YYYYMM}.
 * Nunca lanza — las métricas no deben romper el flujo de envío/webhook.
 */
export async function bumpMetric(
  presetId: string | undefined | null,
  field: MetricField
): Promise<void> {
  if (!presetId) return;
  try {
    const db = getAdminDb();
    const month = new Date().toISOString().slice(0, 7).replace("-", ""); // YYYYMM
    const docId = `${presetId}_${month}`.replace(/[^\w.-]/g, "_");
    await db
      .collection("outreach_metrics")
      .doc(docId)
      .set(
        {
          presetId,
          month,
          [field]: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  } catch (err) {
    console.error("[outreachSequence] bumpMetric error:", err instanceof Error ? err.message : err);
  }
}
