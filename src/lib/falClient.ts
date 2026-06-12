/**
 * Cliente de fal.ai para el Estudio Creativo.
 *
 * Modelos usados (receta validada en sesión 2026-06-11):
 *   - fal-ai/nano-banana            → imagen hero text-to-image (~$0.04)
 *   - fal-ai/nano-banana/edit       → hero con personaje de marca (referencia)
 *   - fal-ai/veo3/fast/image-to-video → escenas 8s con audio nativo (~$1.20)
 *
 * Gotchas conocidos:
 *   - El response_url de la cola es queue.fal.run/fal-ai/veo3/requests/{id}
 *     (modelo BASE, no el slug completo — el slug completo da 405).
 *   - inference_time < 1s en el status = el trabajo falló al parsear (no generó).
 *   - Server-side con fetch + JSON.stringify el UTF-8 va bien (el bug de
 *     acentes era de shells Windows, no de la API).
 */

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
    throw new Error(
      `fal HTTP ${res.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail ?? json).slice(0, 300)}`
    );
  }
  return json;
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

export type VeoPollResult =
  | { state: "pending" }
  | { state: "done"; videoUrl: string }
  | { state: "failed"; error: string };

/**
 * Un poll del estado de la escena. El caller decide el loop (con presupuesto
 * de tiempo de la function serverless) — si se acaba el tiempo devuelve
 * "pending" y el cliente re-llama: NUNCA se re-encola (no se paga doble).
 */
export async function pollVeo(requestId: string): Promise<VeoPollResult> {
  const status = await falFetch(
    `${FAL_QUEUE}/fal-ai/veo3/requests/${requestId}/status`,
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
    const resp = await falFetch(`${FAL_QUEUE}/fal-ai/veo3/requests/${requestId}`, {
      method: "GET",
    });
    const video = resp.video as { url?: string } | undefined;
    if (!video?.url) return { state: "failed", error: "fal completó sin URL de video." };
    return { state: "done", videoUrl: video.url };
  }

  return { state: "failed", error: `Estado fal inesperado: ${s}` };
}
