/**
 * ¿Le faltan a este sitio los datos de SEO local?
 *
 * `categoria` y `ciudad` alimentan el LocalBusiness JSON-LD del sitio
 * (`addressLocality`, `areaServed`) y el bloque "negocios en tu ciudad".
 * Sin ellos, el sitio existe pero no compite en búsquedas locales.
 *
 * Única definición del criterio: el aviso del cliente y cualquier reporte
 * del admin deben usar esta función, no repetir la comprobación.
 */
export interface SeoLocalCampos {
  categoria?: string | null;
  ciudad?: string | null;
}

export function faltaSeoLocal(sitio: SeoLocalCampos): boolean {
  const categoria = (sitio.categoria ?? "").trim();
  const ciudad = (sitio.ciudad ?? "").trim();
  return categoria.length === 0 || ciudad.length === 0;
}
