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
   * Frase que envuelve las cifras. Placeholders: `{inversion}`, `{contactos}`,
   * `{costoPorContacto}`, `{tasaContacto}`, `{industria}`, `{ciudad}`.
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

export const guiasAds: GuiaAds[] = [];

export function buscarGuia(slug: string): GuiaAds | undefined {
  return guiasAds.find((g) => g.slug === slug);
}
