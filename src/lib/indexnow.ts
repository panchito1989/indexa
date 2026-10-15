/**
 * IndexNow — aviso inmediato a Bing (y Yandex, Naver, Seznam) de qué URLs
 * cambiaron. Importa porque ChatGPT busca con el índice de Bing: una página
 * que Bing no tiene, ChatGPT no la puede citar.
 *
 * Protocolo: POST JSON a api.indexnow.org con host, clave, ubicación de la
 * clave y lista de URLs. La clave NO es secreta: por diseño se sirve en
 * `https://<host>/<clave>.txt` para que el buscador verifique que somos
 * dueños del dominio. Vive en `public/` y el test comprueba que el archivo y
 * esta constante coincidan.
 *
 * Google no participa en IndexNow: ahí sigue siendo Search Console (sitemap +
 * "Solicitar indexación").
 */

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** 32 hex en minúsculas, el formato que IndexNow acepta sin problemas. */
export const INDEXNOW_KEY = "da933e288c7be42f2383f9f19c8d618a";

/** Máximo de URLs por envío según el protocolo. */
export const INDEXNOW_MAX_URLS = 10_000;

export function claveValida(key: string): boolean {
  return /^[a-f0-9]{32}$/.test(key);
}

/**
 * Extrae las URLs de un sitemap XML. Regex a propósito: el sitemap es nuestro,
 * plano (sin índice de sitemaps) y no vale la pena una dependencia XML.
 */
export function urlsDeSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&")
  );
}

/** Deja sólo las URLs que pertenecen al host (IndexNow rechaza las ajenas). */
export function soloDelHost(urls: string[], host: string): string[] {
  const vistas = new Set<string>();
  const propias: string[] = [];
  for (const u of urls) {
    try {
      const { hostname } = new URL(u);
      if (hostname === host && !vistas.has(u)) {
        vistas.add(u);
        propias.push(u);
      }
    } catch {
      /* URL malformada: se ignora */
    }
  }
  return propias;
}

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

export function payloadIndexNow(host: string, key: string, urls: string[]): IndexNowPayload {
  return {
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    urlList: urls.slice(0, INDEXNOW_MAX_URLS),
  };
}

export interface ResultadoIndexNow {
  enviadas: number;
  status: number;
  /** 200 y 202 significan "recibido" según el protocolo. */
  aceptado: boolean;
}

/**
 * Envía las URLs. `fetchImpl` se inyecta para poder probar sin red.
 * Devuelve el status tal cual: 200/202 aceptado, 400 payload inválido,
 * 403 clave no verificable, 422 URLs que no son del host, 429 demasiadas.
 */
export async function enviarIndexNow(
  host: string,
  urls: string[],
  key: string = INDEXNOW_KEY,
  fetchImpl: typeof fetch = fetch
): Promise<ResultadoIndexNow> {
  if (!claveValida(key)) throw new Error("INDEXNOW_KEY inválida: deben ser 32 hex en minúsculas");

  const propias = soloDelHost(urls, host);
  if (propias.length === 0) return { enviadas: 0, status: 0, aceptado: false };

  const res = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payloadIndexNow(host, key, propias)),
  });

  return { enviadas: propias.length, status: res.status, aceptado: res.status === 200 || res.status === 202 };
}
