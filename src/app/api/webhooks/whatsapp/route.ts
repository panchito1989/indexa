import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";
import { stopSequence, bumpMetric, isActiveSeqStage } from "@/lib/outreachSequence";
import { sendWaReplyAlert } from "@/lib/hotAlert";

/**
 * Webhook de WhatsApp Cloud API.
 * - GET  → verificación (Meta llama con hub.mode=subscribe&hub.verify_token=...&hub.challenge=...)
 * - POST → eventos: estados de mensaje (sent/delivered/read/failed) + mensajes entrantes (opt-out, respuestas)
 *
 * Configurar en Meta:
 *   Callback URL: https://TU_DOMINIO/api/webhooks/whatsapp
 *   Verify Token: el valor de WHATSAPP_VERIFY_TOKEN
 *   Subscriptions: messages, message_status
 */

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || "";

// ── GET: verificación del webhook ──────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// ── Tipos del payload de Meta ──────────────────────────────────────────
interface WaContact {
  wa_id: string;
  profile?: { name?: string };
}
interface WaMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  button?: { text: string; payload: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
}
interface WaStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; message?: string }>;
}
interface WaChange {
  value: {
    messaging_product: "whatsapp";
    metadata: { display_phone_number: string; phone_number_id: string };
    contacts?: WaContact[];
    messages?: WaMessage[];
    statuses?: WaStatus[];
  };
  field: "messages";
}
interface WaWebhookBody {
  object: "whatsapp_business_account";
  entry: Array<{ id: string; changes: WaChange[] }>;
}

// ── Helpers ────────────────────────────────────────────────────────────

function isOptOutText(text: string): boolean {
  const t = text.trim().toLowerCase();
  return ["baja", "stop", "no", "no más", "no mas", "cancelar", "unsubscribe"].includes(t);
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!APP_SECRET) return false; // fail-safe: si no se configuró, rechazamos
  if (!signatureHeader) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", APP_SECRET).update(rawBody, "utf8").digest("hex");
  // timing-safe compare
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function findProspectoIdByPhone(phone: string): Promise<string | null> {
  const db = getAdminDb();
  // Intentamos varias variantes del teléfono (con/sin 52 MX, con/sin 1 USA)
  const normalized = phone.replace(/\D+/g, "");
  const variants = new Set<string>([
    normalized,
    normalized.replace(/^52/, ""),
    normalized.startsWith("521") ? normalized.slice(3) : "",
    normalized.startsWith("52") ? normalized.slice(2) : "",
    // USA: wa_id "1XXXXXXXXXX" ↔ teléfono guardado de 10 dígitos
    normalized.startsWith("1") && normalized.length === 11 ? normalized.slice(1) : "",
    normalized.length === 10 ? `1${normalized}` : "",
  ]);
  variants.delete("");

  for (const v of variants) {
    const q = await db.collection("prospectos_frios").where("telefono", "==", v).limit(1).get();
    if (!q.empty) return q.docs[0].id;
  }
  // También buscar por wa_id exacto
  const q2 = await db
    .collection("prospectos_frios")
    .where("wa_id", "==", normalized)
    .limit(1)
    .get();
  if (!q2.empty) return q2.docs[0].id;
  return null;
}

// ── POST: recibe eventos ───────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, signature)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let body: WaWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const db = getAdminDb();

  try {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        // 1) Statuses de mensajes salientes
        for (const st of value.statuses || []) {
          const q = await db
            .collection("prospectos_frios")
            .where("wa_message_id", "==", st.id)
            .limit(1)
            .get();
          if (!q.empty) {
            const update: Record<string, unknown> = {
              wa_status: st.status,
              [`wa_status_at_${st.status}`]: FieldValue.serverTimestamp(),
            };
            if (st.status === "failed" && st.errors?.length) {
              update.wa_last_error = st.errors[0].message || st.errors[0].title;
            }
            await q.docs[0].ref.update(update);

            // Métricas por preset (qué copy se entrega/lee/falla)
            if (st.status === "delivered" || st.status === "read" || st.status === "failed") {
              const d = q.docs[0].data();
              await bumpMetric(d.wa_last_outreach_preset || d.wa_template, st.status);
            }
          }
        }

        // 2) Mensajes entrantes — detectar opt-out y registrar respuestas
        for (const msg of value.messages || []) {
          const from = msg.from; // wa_id (E.164 sin +)
          const text =
            msg.text?.body ||
            msg.button?.text ||
            msg.interactive?.button_reply?.title ||
            msg.interactive?.list_reply?.title ||
            "";

          // Idempotencia: Meta entrega "at-least-once". Reclamamos msg.id como
          // ID de doc en whatsapp_inbox; si create() falla por ya-existe, este
          // mensaje ya se procesó OK → short-circuit (no duplicar métricas/
          // alertas). Si algo CRÍTICO falla más abajo, borramos el reclamo para
          // que el reintento de Meta sí reprocese (no perder un opt-out).
          const inboxRef = db.collection("whatsapp_inbox").doc(msg.id);
          try {
            await inboxRef.create({
              from,
              text,
              type: msg.type,
              messageId: msg.id,
              optOut: isOptOutText(text),
              receivedAt: FieldValue.serverTimestamp(),
            });
          } catch {
            continue; // ya procesado
          }

          try {
          const prospectoId = await findProspectoIdByPhone(from);
          const optOut = isOptOutText(text);
          if (prospectoId) {
            await inboxRef.set({ prospectoId }, { merge: true });
          }

          if (prospectoId) {
            const ref = db.collection("prospectos_frios").doc(prospectoId);
            const snap = await ref.get();
            const data = snap.data() || {};
            const presetKey = data.wa_last_outreach_preset || data.wa_template;
            const seqActive = isActiveSeqStage(data.wa_seq_stage);

            const update: Record<string, unknown> = {
              wa_last_inbound_at: FieldValue.serverTimestamp(),
              wa_last_inbound_text: text,
              wa_id: from,
            };
            if (optOut) {
              update.wa_opted_out = true;
              update.wa_opted_out_at = FieldValue.serverTimestamp();
            } else {
              // Respondió → bandeja prioritaria para que el admin conteste
              // dentro de la ventana de 24h de Meta.
              update.wa_priority = true;
            }
            // El opt-out es CRÍTICO (cumplimiento WhatsApp): si falla persistir,
            // propagamos para devolver 5xx y que Meta reintente (idempotente).
            // El resto del procesamiento (métricas/alerta) es best-effort.
            await ref.update(update);

            if (optOut) {
              if (seqActive) await stopSequence(ref, "opted_out");
              await bumpMetric(presetKey, "opted_out");
            } else {
              if (seqActive) await stopSequence(ref, "replied");
              await bumpMetric(presetKey, "replied");
              // Alertar solo al abrir conversación (no por cada mensaje del
              // mismo hilo): cuando la secuencia estaba viva o aún no estaba
              // marcado como prioritario.
              if (seqActive || data.wa_priority !== true) {
                await sendWaReplyAlert({
                  prospectoId,
                  nombre: typeof data.nombre === "string" ? data.nombre : from,
                  telefono: typeof data.telefono === "string" ? data.telefono : from,
                  inboundText: text,
                  lastPreset: typeof presetKey === "string" ? presetKey : undefined,
                  lastStage:
                    typeof data.wa_last_outreach_stage === "string"
                      ? data.wa_last_outreach_stage
                      : undefined,
                });
              }
            }
          }
          } catch (procErr) {
            // Algo crítico falló tras reclamar el msg.id → borra el reclamo
            // para que el reintento de Meta reprocese (idempotencia + no perder
            // opt-out), y propaga para devolver 5xx.
            await inboxRef.delete().catch(() => {});
            throw procErr;
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Si falló persistir un opt-out, devolvemos 5xx para que Meta REINTENTE
    // (marcar wa_opted_out=true es idempotente). Devolver 200 aquí perdería
    // bajas y nos haría seguir escribiendo a quien pidió no recibir →
    // violación de política WhatsApp. El registro idempotente por msg.id evita
    // duplicar el procesamiento ya completado en el reintento.
    console.error("Webhook WA error:", err);
    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 500 });
  }
}
