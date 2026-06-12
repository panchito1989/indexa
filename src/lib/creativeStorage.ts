/**
 * Storage del Estudio Creativo — PREFIERE Vercel Blob (capa gratis, no fal),
 * cae al CDN de fal si no hay Blob configurado.
 *
 * Historia: Firebase Storage se cerró (billing) → se usó el CDN de fal, pero
 * al agotarse el saldo de fal TODO se bloqueaba (hasta guardar la voz gratis).
 * Vercel Blob desacopla el almacenamiento del saldo de fal: si
 * BLOB_READ_WRITE_TOKEN está presente (se crea con 1 clic en Vercel y el token
 * se inyecta solo), el modo $0 (imágenes Gemini + voz Edge) NO toca fal.
 *
 * Convención: los campos *Path/*Url de creative_jobs guardan la URL pública.
 * `signedUrl()` se conserva como passthrough.
 */

import { put as blobPut } from "@vercel/blob";

const FAL_STORAGE_INITIATE =
  "https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3";

function falKey(): string {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY no configurada en el entorno.");
  return key;
}

export function blobAvailable(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Sube un buffer y devuelve la URL pública. Usa Vercel Blob si está
 * configurado (gratis, independiente de fal); si no, el CDN de fal.
 */
export async function saveBuffer(
  fileName: string,
  buf: Buffer,
  contentType: string
): Promise<string> {
  const safeName = fileName.replace(/[^\w.-]/g, "_").slice(-80);

  // 1) Vercel Blob (preferido — no depende del saldo de fal)
  if (blobAvailable()) {
    const { url } = await blobPut(`creative/${Date.now()}_${safeName}`, buf, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    return url;
  }

  // 2) Fallback: CDN de fal (requiere saldo)
  const initRes = await fetch(FAL_STORAGE_INITIATE, {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file_name: safeName, content_type: contentType }),
  });
  if (!initRes.ok) {
    const body = (await initRes.text()).slice(0, 200);
    // Saldo agotado → mensaje accionable (no el 403 crudo de fal)
    if (initRes.status === 403 && /balance|locked|exhausted/i.test(body)) {
      throw new Error(
        "Se agotó el saldo de fal.ai y no hay almacenamiento gratis configurado. " +
        "Activa Vercel Blob (1 clic en el panel de Vercel) o recarga fal en fal.ai/dashboard/billing."
      );
    }
    throw new Error(`fal storage initiate HTTP ${initRes.status}: ${body}`);
  }
  const { file_url, upload_url } = (await initRes.json()) as {
    file_url?: string;
    upload_url?: string;
  };
  if (!file_url || !upload_url) throw new Error("fal storage no devolvió URLs.");

  const putRes = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(buf),
  });
  if (!putRes.ok) {
    throw new Error(`fal storage PUT HTTP ${putRes.status}: ${(await putRes.text()).slice(0, 200)}`);
  }

  return file_url;
}

/**
 * Passthrough de compatibilidad: los valores guardados YA son URLs públicas.
 * (Con Firebase Storage esto firmaba rutas gs:// — ver nota de arriba.)
 */
export async function signedUrl(pathOrUrl: string, _days = 7): Promise<string> {
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  throw new Error(`Ruta no soportada (se esperaba URL pública): ${pathOrUrl.slice(0, 80)}`);
}

/** Descarga un asset (URL pública del CDN) a Buffer — para ffmpeg en /tmp. */
export async function downloadToBuffer(url: string): Promise<Buffer> {
  return fetchToBuffer(url);
}

/** Descarga una URL externa a Buffer. */
export async function fetchToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Descarga falló (HTTP ${res.status}): ${url.slice(0, 120)}`);
  return Buffer.from(await res.arrayBuffer());
}
