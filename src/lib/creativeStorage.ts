/**
 * Storage del Estudio Creativo — implementado sobre el CDN de fal.ai.
 *
 * NOTA: la implementación original usaba Firebase Storage, pero la cuenta de
 * facturación de Google Cloud del proyecto está cerrada ("billing account…
 * disabled in state closed") y Storage no opera sin ella. El CDN de fal ya
 * está pagado (es el mismo proveedor que genera los assets), las URLs son
 * públicas-no-adivinables y sin expiración práctica. Si algún día se habilita
 * el billing de Firebase, basta con reimplementar estas 4 funciones.
 *
 * Convención: los campos *Path de creative_jobs guardan directamente la URL
 * pública (https://v3b.fal.media/...). `signedUrl()` se conserva como
 * passthrough para no tocar a los consumidores.
 */

const FAL_STORAGE_INITIATE =
  "https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3";

function falKey(): string {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY no configurada en el entorno.");
  return key;
}

/**
 * Sube un buffer al CDN de fal y devuelve la URL pública.
 * `fileName` es solo un nombre sugerido (fal le antepone un id aleatorio).
 */
export async function saveBuffer(
  fileName: string,
  buf: Buffer,
  contentType: string
): Promise<string> {
  // Sanea el nombre (fal lo incluye literal en la URL)
  const safeName = fileName.replace(/[^\w.-]/g, "_").slice(-80);

  const initRes = await fetch(FAL_STORAGE_INITIATE, {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file_name: safeName, content_type: contentType }),
  });
  if (!initRes.ok) {
    throw new Error(`fal storage initiate HTTP ${initRes.status}: ${(await initRes.text()).slice(0, 200)}`);
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
