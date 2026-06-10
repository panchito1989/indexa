/**
 * Preparación de imágenes para anuncios (Performance Max / Display).
 *
 * Google exige proporciones EXACTAS (tolerancia ~1%) y mínimos:
 *  - Marketing image 1.91:1 → generamos 1200x628 (mín 600x314)
 *  - Square marketing image 1:1 → 1200x1200 (mín 300x300)
 *  - Logo 1:1 → 512x512 (mín 128x128)
 *
 * Las fotos reales del sitio del cliente casi nunca vienen en esas proporciones,
 * así que se adaptan con sharp: recorte inteligente (cover/attention) para fotos
 * y contain con fondo blanco para logos (un logo no debe recortarse).
 */
import sharp from "sharp";

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`No pude descargar la imagen (HTTP ${res.status}): ${url.slice(0, 120)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_SOURCE_BYTES) throw new Error("La imagen fuente pesa más de 15MB.");
    return buf;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Timeout descargando la imagen: ${url.slice(0, 120)}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export interface PmaxImages {
  marketingImage: string; // base64 JPEG 1200x628 (1.91:1)
  squareImage: string; // base64 JPEG 1200x1200 (1:1)
  logoImage: string; // base64 PNG 512x512 (1:1)
}

const GEMINI_IMAGE_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

/**
 * Genera una foto publicitaria con IA y la devuelve en base64 — para clientes
 * cuyo sitio no tiene fotos o que piden una imagen nueva para sus anuncios.
 * Intenta Gemini (mismo modelo que /api/generate-image) y cae a DALL-E 3:
 * OPENAI_API_KEY sí está configurada en prod (la usan meta-ads y tiktok-ads),
 * GEMINI_API_KEY puede no estarlo.
 */
export async function generateAdPhotoBase64(description: string): Promise<string> {
  const prompt = `${description.trim()}. Fotografía realista de alta calidad para anuncio publicitario, bien iluminada, sin texto, sin logotipos ni marcas de agua, encuadre amplio.`;

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  let geminiError = "GEMINI_API_KEY no configurada";
  if (geminiKey) {
    try {
      const res = await fetch(`${GEMINI_IMAGE_ENDPOINT}?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
      });
      const data = await res.json().catch(() => null) as {
        error?: { message?: string };
        candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
      } | null;
      const img = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
      if (img) return img;
      geminiError = data?.error?.message || `HTTP ${res.status} sin imagen`;
    } catch (e) {
      geminiError = e instanceof Error ? e.message : String(e);
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error(`No pude generar la imagen (Gemini: ${geminiError}; OPENAI_API_KEY tampoco está configurada).`);
  }
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1792x1024", // horizontal: mejor base para el recorte 1.91:1 de Google
      response_format: "b64_json",
    }),
  });
  const data = await res.json().catch(() => null) as {
    error?: { message?: string };
    data?: Array<{ b64_json?: string }>;
  } | null;
  const img = data?.data?.[0]?.b64_json;
  if (!img) {
    throw new Error(`No pude generar la imagen (Gemini: ${geminiError}; DALL-E: ${data?.error?.message || `HTTP ${res.status}`}).`);
  }
  return img;
}

/**
 * Construye el set mínimo de imágenes que exige un asset group de PMax a partir
 * de una foto (por URL o base64) y un logo (opcional — sin logo, se usa un
 * recorte cuadrado de la foto para no bloquear la creación).
 */
export async function preparePmaxImages(opts: { photoUrl?: string; photoBase64?: string; logoUrl?: string }): Promise<PmaxImages> {
  let photo: Buffer;
  if (opts.photoBase64) {
    photo = Buffer.from(opts.photoBase64, "base64");
  } else if (opts.photoUrl) {
    photo = await fetchImageBuffer(opts.photoUrl);
  } else {
    throw new Error("Falta la foto: pasa photoUrl o photoBase64.");
  }

  const marketing = await sharp(photo)
    .resize(1200, 628, { fit: "cover", position: "attention" })
    .jpeg({ quality: 88 })
    .toBuffer();

  const square = await sharp(photo)
    .resize(1200, 1200, { fit: "cover", position: "attention" })
    .jpeg({ quality: 88 })
    .toBuffer();

  let logo: Buffer | null = null;
  if (opts.logoUrl) {
    try {
      const logoSrc = await fetchImageBuffer(opts.logoUrl);
      logo = await sharp(logoSrc)
        .resize(512, 512, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer();
    } catch {
      logo = null; // logo opcional: si falla, cae al recorte de la foto
    }
  }
  if (!logo) {
    logo = await sharp(photo)
      .resize(512, 512, { fit: "cover", position: "attention" })
      .png()
      .toBuffer();
  }

  return {
    marketingImage: marketing.toString("base64"),
    squareImage: square.toString("base64"),
    logoImage: logo.toString("base64"),
  };
}
