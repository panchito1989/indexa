/**
 * Cliente de fal.ai para el Estudio Creativo.
 *
 * Modelos usados (receta validada en sesión 2026-06-11):
 *   - fal-ai/nano-banana            → imagen hero text-to-image (~$0.04)
 *   - fal-ai/nano-banana/edit       → hero con personaje de marca (referencia)
 *   - fal-ai/veo3/fast/image-to-video → escenas 8s con audio nativo (~$1.20)
 *
 * MODO AHORRO (jun-2026 — Veo quemó los créditos en 3 videos):
 *   - fal-ai/flux/schnell           → imágenes a $0.003 (13x más barato; solo
 *                                     cuando NO hay referencias de producto)
 *   - fal-ai/wan/v2.2-5b/image-to-video → clips económicos (~$0.25 vs ~$2 Veo)
 *   - Edge TTS (Microsoft, GRATIS)  → narración es-MX; minimax queda de respaldo
 *
 * Gotchas conocidos:
 *   - El response_url de la cola es queue.fal.run/{owner}/{app}/requests/{id}
 *     (modelo BASE, no el slug completo — el slug completo da 405).
 *   - inference_time < 1s en el status = el trabajo falló al parsear (no generó).
 *   - Server-side con fetch + JSON.stringify el UTF-8 va bien (el bug de
 *     acentes era de shells Windows, no de la API).
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import getMP3Duration from "get-mp3-duration";

const FAL_QUEUE = "https://queue.fal.run";
const FAL_SYNC = "https://fal.run";

function falKey(): string {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY no configurada en el entorno.");
  return key;
}

async function falFetch(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Key ${falKey()}`,
      "Content-Type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`fal respondió no-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const detail = (json as { detail?: unknown }).detail;
    const raw = typeof detail === "string" ? detail : JSON.stringify(detail ?? json);
    // El content checker de fal/Veo rechaza prompts (menores, marcas,
    // personas reales…) con 422 content_policy_violation — error TIPADO para
    // que el pipeline reintente con prompt saneado en vez de morir.
    if (raw.includes("content_policy_violation") || /content checker|flagged/i.test(raw)) {
      throw new ContentPolicyError(`fal rechazó el contenido por políticas: ${raw.slice(0, 200)}`);
    }
    throw new Error(`fal HTTP ${res.status}: ${raw.slice(0, 300)}`);
  }
  return json;
}

/** El generador rechazó el prompt por políticas de contenido (no es un fallo
 *  transitorio: reintentar igual NO sirve — hay que cambiar el prompt). */
export class ContentPolicyError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "ContentPolicyError";
  }
}

// ── Imágenes (síncrono, ~10-20s) ────────────────────────────────────────

export interface FalImage {
  url: string;
  width?: number;
  height?: number;
}

/**
 * Genera una imagen. Si hay referencias (personaje de marca del proyecto,
 * fotos de producto/objeto subidas por el usuario) usa nano-banana/edit para
 * conservar la identidad EXACTA de esos elementos (acepta hasta ~5 imágenes).
 */
export async function generateHeroImage(
  prompt: string,
  referenceUrls?: string[],
  aspectRatio: "9:16" | "16:9" = "9:16"
): Promise<FalImage> {
  const refs = (referenceUrls || []).filter(Boolean).slice(0, 5);
  const body = refs.length
    ? { prompt, image_urls: refs, aspect_ratio: aspectRatio, num_images: 1, output_format: "jpeg" }
    : { prompt, aspect_ratio: aspectRatio, num_images: 1, output_format: "jpeg" };
  const slug = refs.length ? "fal-ai/nano-banana/edit" : "fal-ai/nano-banana";

  const json = await falFetch(`${FAL_SYNC}/${slug}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const images = json.images as FalImage[] | undefined;
  if (!images?.[0]?.url) throw new Error("fal no devolvió imagen.");
  return images[0];
}

/**
 * Imagen ECONÓMICA con FLUX.1 [schnell] (~$0.003 — 13x más barato que
 * nano-banana). No acepta referencias: úsala solo cuando el proyecto no las
 * tiene (b-roll documental del modo largo).
 */
export async function generateFluxImage(
  prompt: string,
  aspectRatio: "9:16" | "16:9" = "9:16"
): Promise<FalImage> {
  const json = await falFetch(`${FAL_SYNC}/fal-ai/flux/schnell`, {
    method: "POST",
    body: JSON.stringify({
      prompt,
      image_size: aspectRatio === "16:9" ? "landscape_16_9" : "portrait_16_9",
      num_images: 1,
    }),
  });
  const images = json.images as FalImage[] | undefined;
  if (!images?.[0]?.url) throw new Error("fal no devolvió imagen (FLUX).");
  return images[0];
}

// ── TTS (minimax speech-02-hd, voz en off para modo largo) ──────────────

export interface TtsResult {
  audioUrl: string;
  durationMs: number;
}

/**
 * Narración en español (máx 5,000 chars — el modo largo llama POR SEGMENTO,
 * ~40 palabras c/u). `durationMs` viene exacto del modelo → sincronización
 * de visuales sin ffprobe.
 */
export async function generateTts(
  text: string,
  voiceId = "Deep_Voice_Man",
  speed = 1.0
): Promise<TtsResult> {
  const json = await falFetch(`${FAL_SYNC}/fal-ai/minimax/speech-02-hd`, {
    method: "POST",
    body: JSON.stringify({
      text,
      voice_setting: { voice_id: voiceId, speed, vol: 1, pitch: 0 },
      language_boost: "Spanish",
      output_format: "url",
      // OJO: sample_rate y channel son NÚMEROS (strings → 422 literal_error)
      audio_setting: { format: "mp3", sample_rate: 32000, bitrate: 128000, channel: 1 },
    }),
  });
  const audio = json.audio as { url?: string } | undefined;
  const durationMs = Number(json.duration_ms);
  if (!audio?.url || !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("fal TTS no devolvió audio/duración.");
  }
  return { audioUrl: audio.url, durationMs };
}

// ── TTS GRATIS (Edge TTS de Microsoft — voces neurales es-MX) ────────────

// Mapa de las voces minimax que guarda el proyecto → voces Edge equivalentes.
const EDGE_VOICES: Record<string, string> = {
  Deep_Voice_Man: "es-MX-JorgeNeural",
  Wise_Woman: "es-MX-DaliaNeural",
  Friendly_Person: "es-MX-DaliaNeural",
};

/**
 * Narración GRATIS con Edge TTS (API no oficial de Microsoft — calidad
 * neural es-MX excelente). Devuelve el buffer mp3 directo (no hay CDN de por
 * medio) y la duración medida del propio mp3 (get-mp3-duration, sin ffprobe).
 * Si Microsoft la rompe algún día, el caller cae a minimax (de pago).
 */
export async function generateTtsEdge(
  text: string,
  minimaxVoiceId = "Deep_Voice_Man"
): Promise<{ buffer: Buffer; durationMs: number }> {
  const voice = EDGE_VOICES[minimaxVoiceId] || "es-MX-JorgeNeural";
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text);
  const chunks: Buffer[] = [];
  for await (const c of audioStream) chunks.push(Buffer.from(c as Buffer));
  try { tts.close(); } catch { /* best-effort */ }
  const buffer = Buffer.concat(chunks);
  if (buffer.length < 1_000) throw new Error("Edge TTS devolvió audio vacío.");
  const durationMs = getMP3Duration(buffer);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("No se pudo medir la duración del audio de Edge TTS.");
  }
  return { buffer, durationMs };
}

// ── Video Veo 3 (cola asíncrona, 1-3 min por escena) ────────────────────

export interface VeoSubmitResult {
  requestId: string;
}

/** Encola una escena image-to-video. Devuelve el request_id para poll/reanudación. */
export async function submitVeoScene(opts: {
  prompt: string;
  imageUrl: string; // URL pública o data URI
  durationSec?: 4 | 6 | 8;
  aspectRatio?: "9:16" | "16:9";
  /** false en modo largo: la narración TTS va encima (y es más barato). */
  generateAudio?: boolean;
}): Promise<VeoSubmitResult> {
  const json = await falFetch(`${FAL_QUEUE}/fal-ai/veo3/fast/image-to-video`, {
    method: "POST",
    body: JSON.stringify({
      prompt: opts.prompt,
      image_url: opts.imageUrl,
      aspect_ratio: opts.aspectRatio ?? "9:16",
      duration: `${opts.durationSec ?? 8}s`,
      resolution: "720p",
      generate_audio: opts.generateAudio ?? true,
    }),
  });
  const requestId = json.request_id as string | undefined;
  if (!requestId) throw new Error("fal no devolvió request_id.");
  return { requestId };
}

// ── Clip ECONÓMICO (Wan 2.2 5B — ~$0.25 vs ~$2 de Veo por clip) ──────────

/** Raíz del app para las URLs de status/result del queue (ver gotcha arriba). */
export const ECON_VIDEO_ROOT = "fal-ai/wan";

/**
 * Encola un clip image-to-video económico. Sin audio nativo (la narración TTS
 * va encima igual que con Veo). El aspecto sale de la imagen base, y la
 * duración del clip (~5s) la estira el render con tpad si el audio es más
 * largo — mismo contrato que las escenas Veo del modo largo.
 */
export async function submitEconomyScene(opts: {
  prompt: string;
  imageUrl: string;
}): Promise<VeoSubmitResult> {
  const json = await falFetch(`${FAL_QUEUE}/fal-ai/wan/v2.2-5b/image-to-video`, {
    method: "POST",
    body: JSON.stringify({
      prompt: opts.prompt,
      image_url: opts.imageUrl,
      resolution: "720p",
    }),
  });
  const requestId = json.request_id as string | undefined;
  if (!requestId) throw new Error("fal no devolvió request_id (Wan).");
  return { requestId };
}

export type VeoPollResult =
  | { state: "pending" }
  | { state: "done"; videoUrl: string }
  | { state: "failed"; error: string };

/**
 * Un poll del estado de la escena. El caller decide el loop (con presupuesto
 * de tiempo de la function serverless) — si se acaba el tiempo devuelve
 * "pending" y el cliente re-llama: NUNCA se re-encola (no se paga doble).
 */
export async function pollVeo(requestId: string, modelRoot = "fal-ai/veo3"): Promise<VeoPollResult> {
  try {
    const status = await falFetch(
      `${FAL_QUEUE}/${modelRoot}/requests/${requestId}/status`,
      { method: "GET" }
    );
    const s = status.status as string;
    if (s === "IN_QUEUE" || s === "IN_PROGRESS") return { state: "pending" };

    if (s === "COMPLETED") {
      // inference_time ínfimo = falló el parseo del payload (no hay video)
      const metrics = status.metrics as { inference_time?: number } | undefined;
      if (typeof metrics?.inference_time === "number" && metrics.inference_time < 1) {
        return { state: "failed", error: "fal aceptó el trabajo pero no generó (payload inválido)." };
      }
      const resp = await falFetch(`${FAL_QUEUE}/${modelRoot}/requests/${requestId}`, {
        method: "GET",
      });
      const video = resp.video as { url?: string } | undefined;
      if (!video?.url) return { state: "failed", error: "fal completó sin URL de video." };
      return { state: "done", videoUrl: video.url };
    }

    return { state: "failed", error: `Estado fal inesperado: ${s}` };
  } catch (err) {
    // El rechazo por política puede llegar EN EL POLL (el request quedó
    // encolado y fal lo marca al consultarlo): devolverlo como estado
    // "failed" — no como excepción — para que el caller aplique su rama de
    // degradación en vez de tumbar toda la fase.
    if (err instanceof ContentPolicyError) {
      return { state: "failed", error: `content_policy_violation: ${err.message}` };
    }
    throw err;
  }
}
