/**
 * Redirecciones 301 de URLs que ya no existen pero que Google, Bing y los
 * enlaces externos siguen conociendo: pillar pages de la versión anterior del
 * sitio, el enlace interno roto `/demo` y las landings de ciudad fusionadas.
 *
 * Search Console las reportaba como "No se encuentra (404)". Un 404 desperdicia
 * rastreo en un dominio que apenas lo recibe; un 301 al equivalente más cercano
 * conserva la señal acumulada y evita el "soft 404" de mandar todo a la home.
 *
 * Lo consume `next.config.ts` (`redirects()`), así que este módulo no puede
 * depender del runtime de Next ni del alias `@/`.
 */

export interface RedireccionLegacy {
  /** Ruta de origen en sintaxis de `next.config` (`/ruta` o `/ruta/:slug`). */
  source: string;
  /** Ruta interna de destino; siempre una página viva (lo comprueba el test). */
  destination: string;
  permanent: true;
}

/** Página de producto de sitios web: destino de las landings de ciudad fusionadas. */
export const DESTINO_PAGINAS_WEB = "/servicios/sitios-web-ia";

/**
 * Ciudades cuyas landings `/pagina-web-<ciudad>` se fusionaron en 2026-10.
 * Eran la misma plantilla con el nombre cambiado y Google las dejó tres meses
 * en "Descubierta, sin indexar". Se conserva sólo CDMX, que tiene un caso real.
 */
export const CIUDADES_FUSIONADAS = [
  "guadalajara",
  "monterrey",
  "puebla",
  "queretaro",
  "tijuana",
  "merida",
  "leon",
] as const;

const r = (source: string, destination: string): RedireccionLegacy => ({
  source,
  destination,
  permanent: true,
});

export const REDIRECCIONES_LEGACY: readonly RedireccionLegacy[] = [
  // El botón "Ver demo" enlazaba /demo, que nunca existió (sólo /demo/[slug]).
  r("/demo", "/probar"),

  // Pillar pages de la versión anterior del sitio, retiradas en la migración.
  r("/agencia-digital", "/agencia-de-marketing-digital"),
  r("/paginas-web", DESTINO_PAGINAS_WEB),
  r("/seo-para-negocios", "/agencia-de-seo"),
  r("/automatizacion-de-negocios", "/servicios/automatizaciones"),
  r("/automatizacion/:slug", "/servicios/automatizaciones"),
  r("/desarrollo-de-software", "/servicios/automatizaciones"),

  // Sus versiones USA → hub USA-Hispano.
  r("/marketing-digital-usa", "/usa"),
  r("/paginas-web-usa", "/usa"),
  r("/seo-usa", "/usa"),
  r("/automatizaciones-usa", "/usa"),
  r("/desarrollo-software-usa", "/usa"),

  // Landings de ciudad fusionadas.
  ...CIUDADES_FUSIONADAS.map((c) => r(`/pagina-web-${c}`, DESTINO_PAGINAS_WEB)),
];
