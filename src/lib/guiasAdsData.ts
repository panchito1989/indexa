/**
 * Registro del cluster de guías de administración de campañas.
 *
 * Las 16 guías anteriores siguen siendo páginas estáticas bajo
 * `src/app/guia/<slug>/page.tsx`. Next prioriza la ruta estática sobre la
 * dinámica `[slug]`, así que ambas conviven sin tocarse.
 */

export interface GuiaSeccion {
  /** Encabezado. Debe ser la pregunta literal que responde (spec §5.3). */
  titulo: string;
  /** Párrafos. Markdown mínimo: sólo **negritas** y saltos de línea. */
  parrafos: string[];
  /** Lista numerada de pasos, opcional. */
  pasos?: string[];
  /** Tabla comparativa, opcional. Los modelos la extraen con alta fidelidad. */
  tabla?: { encabezados: string[]; filas: string[][] };
}

export interface GuiaFAQ {
  pregunta: string;
  respuesta: string;
}

export interface GuiaDatoPropio {
  /** Slug del caso en `src/data/casos-ads.json` que respalda la guía. */
  caso: string;
  /**
   * Frase que envuelve las cifras. Placeholders válidos: los de
   * `PLACEHOLDERS_DATO_PROPIO`. Debe usar al menos una cifra
   * (`{inversion}`, `{contactos}`, `{costoPorContacto}` o `{tasaContacto}`):
   * una plantilla que sólo dice "{industria} en {ciudad}" no aporta dato.
   * Si el caso no existe, la página omite el bloque entero: nunca inventa.
   */
  plantilla: string;
}

export interface GuiaAds {
  slug: string;
  mercado: "mx" | "usa";
  familia: "diagnostico" | "presupuesto" | "decision" | "traduccion";
  seoTitle: string;
  seoDescription: string;
  h1: string;
  /** 40-60 palabras, autocontenida, citable sola. Spec §5.1. */
  respuestaDirecta: string;
  secciones: GuiaSeccion[];
  faq: GuiaFAQ[];
  datoPropio: GuiaDatoPropio;
  /** Slugs de 2-3 guías de la misma familia. */
  hermanas: string[];
  /**
   * Ancla del caso de éxito de esa industria dentro de /casos-de-exito
   * (spec §4.3). Hoy esa página está desconectada del resto del sitio; esto
   * es lo que convierte el consejo genérico en "esta gente ya lo hizo".
   * `null` mientras no exista un caso publicado para la industria.
   */
  casoExito: string | null;
  /** "YYYY-MM", visible en la página. Spec §5.5. */
  actualizado: string;
}

/** Placeholders que `renderDatoPropio` sustituye con las cifras del caso. */
export const PLACEHOLDERS_DATO_PROPIO = [
  "inversion",
  "contactos",
  "costoPorContacto",
  "tasaContacto",
  "industria",
  "ciudad",
] as const;

/** Los que aportan una cifra. La plantilla debe usar al menos uno. */
const PLACEHOLDERS_CON_CIFRA = ["inversion", "contactos", "costoPorContacto", "tasaContacto"];

const ABRE_CON_RELLENO = /en este art[íi]culo|a continuaci[óo]n|veremos/i;

export const guiasAds: GuiaAds[] = [];

export function buscarGuia(slug: string): GuiaAds | null {
  return guiasAds.find((g) => g.slug === slug) ?? null;
}

export interface ContextoValidacion {
  /** Slugs de todas las guías del registro (para resolver `hermanas`). */
  slugs: Set<string>;
  /** Carpetas estáticas bajo `src/app/guia/` (no pueden repetirse como slug). */
  estaticas: Set<string>;
}

/**
 * Reglas de citabilidad del spec §5 aplicadas a una guía. Devuelve la lista
 * de violaciones; vacía si la guía es publicable.
 *
 * Es la única definición de "guía válida": el test del registro la aplica a
 * cada entrada, y los fixtures del test prueban que cada regla realmente
 * rechaza lo que debe rechazar (con el registro vacío, un bucle sobre él no
 * demostraría nada).
 */
export function validarGuia(g: GuiaAds, ctx: ContextoValidacion): string[] {
  const fallas: string[] = [];

  if (!/^[a-z0-9-]+$/.test(g.slug)) fallas.push(`slug inválido: "${g.slug}"`);
  if (ctx.estaticas.has(g.slug)) fallas.push(`slug choca con una guía estática: "${g.slug}"`);
  if (!["mx", "usa"].includes(g.mercado)) fallas.push(`mercado inválido: "${g.mercado}"`);

  if (g.seoTitle.length <= 20) fallas.push("seoTitle demasiado corto");
  if (g.seoDescription.length <= 80) fallas.push("seoDescription demasiado corta");
  if (g.h1.length <= 10) fallas.push("h1 demasiado corto");
  if (g.secciones.length === 0) fallas.push("sin secciones");
  if (g.faq.length < 3) fallas.push("faq con menos de 3 preguntas");
  if (!/^\d{4}-\d{2}$/.test(g.actualizado)) fallas.push(`actualizado inválido: "${g.actualizado}"`);

  const palabras = g.respuestaDirecta.trim().split(/\s+/).filter(Boolean).length;
  if (palabras < 35 || palabras > 70) fallas.push(`respuestaDirecta con ${palabras} palabras (debe tener 35-70)`);
  if (ABRE_CON_RELLENO.test(g.respuestaDirecta)) fallas.push("respuestaDirecta abre con relleno");

  if (g.datoPropio.caso.length === 0) fallas.push("datoPropio sin caso");
  const usados = [...g.datoPropio.plantilla.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  const desconocidos = usados.filter((u) => !(PLACEHOLDERS_DATO_PROPIO as readonly string[]).includes(u));
  for (const u of desconocidos) fallas.push(`placeholder desconocido: {${u}}`);
  if (!usados.some((u) => PLACEHOLDERS_CON_CIFRA.includes(u))) fallas.push("plantilla sin ninguna cifra");

  for (const h of g.hermanas) {
    if (h === g.slug) fallas.push("hermana apunta a sí misma");
    else if (!ctx.slugs.has(h)) fallas.push(`hermana inexistente: "${h}"`);
  }

  return fallas;
}
