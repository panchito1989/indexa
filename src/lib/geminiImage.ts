/**
 * Generación de imágenes GRATIS con Gemini 2.5 Flash Image (nano-banana).
 *
 * La API de Google AI tiene capa gratis real: ~500 imágenes/día a 1024² sin
 * tarjeta. Es el MISMO modelo que el /api/generate-image del dashboard, pero
 * aquí lo exponemos como función para el Estudio Creativo (modo $0: imágenes
 * Gemini + voz Edge + render ffmpeg, sin tocar fal).
 */

const GEMINI_IMAGE_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

export function geminiKeyAvailable(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);
}

export interface GeneratedImage {
  buffer: Buffer;
  contentType: string;
}

/**
 * Devuelve el buffer de la imagen (no una URL — el caller la sube a su storage).
 * `aspectRatio` se inyecta en el prompt (forma más robusta entre modelos).
 */
export async function generateGeminiImage(
  prompt: string,
  aspectRatio: "9:16" | "16:9" = "9:16"
): Promise<GeneratedImage> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY no configurada (modo gratis no disponible).");

  const fullPrompt = `${prompt} (cinematic, high quality, output in ${aspectRatio} vertical/horizontal aspect ratio, no text, no watermark)`;
  const res = await fetch(`${GEMINI_IMAGE_ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });

  const rawText = await res.text();
  let data: {
    error?: { message?: string };
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  };
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`Gemini devolvió respuesta inválida (HTTP ${res.status}).`);
  }
  if (data.error) {
    const msg = data.error.message || "Error de Gemini.";
    // Cuota diaria agotada → mensaje claro accionable
    if (/quota|rate|exhausted|RESOURCE_EXHAUSTED/i.test(msg)) {
      throw new Error("Se agotó la cuota gratis de imágenes de Gemini por hoy (≈500/día). Vuelve mañana o usa el modo económico.");
    }
    throw new Error(msg);
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData?.data);
  const b64 = imgPart?.inlineData?.data;
  if (!b64) throw new Error("Gemini no devolvió imagen (posible bloqueo de contenido).");
  return {
    buffer: Buffer.from(b64, "base64"),
    contentType: imgPart?.inlineData?.mimeType || "image/png",
  };
}
