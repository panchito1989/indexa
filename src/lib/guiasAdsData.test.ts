import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buscarGuia,
  guiasAds,
  validarGuia,
  type ContextoValidacion,
  type GuiaAds,
} from "./guiasAdsData";

const GUIA_DIR = path.resolve(__dirname, "..", "app", "guia");

function carpetasEstaticas(): Set<string> {
  if (!existsSync(GUIA_DIR)) throw new Error(`No existe ${GUIA_DIR}: el test no puede verificar colisiones`);
  return new Set(
    readdirSync(GUIA_DIR).filter(
      (e) => statSync(path.join(GUIA_DIR, e)).isDirectory() && !e.startsWith("[")
    )
  );
}

function contexto(guias: GuiaAds[]): ContextoValidacion {
  return { slugs: new Set(guias.map((g) => g.slug)), estaticas: carpetasEstaticas() };
}

/** Una guía que cumple todas las reglas. Base para los fixtures malos. */
const valida: GuiaAds = {
  slug: "por-que-mi-campana-de-google-ads-no-vende",
  mercado: "mx",
  familia: "diagnostico",
  seoTitle: "Por qué mi campaña de Google Ads no vende (y cómo saber la causa)",
  seoDescription:
    "Las cuatro causas reales por las que una campaña de Google Ads gasta sin generar contactos, cómo distinguirlas con datos de tu propia cuenta, y qué hacer con cada una.",
  h1: "Por qué mi campaña de Google Ads no vende",
  respuestaDirecta:
    "Una campaña de Google Ads que gasta sin vender casi siempre falla por una de cuatro causas: las conversiones no están bien medidas, las palabras clave atraen a quien no compra, la página de destino no convierte, o el presupuesto se reparte entre demasiadas campañas. Se distinguen revisando cuatro números concretos de tu cuenta.",
  secciones: [{ titulo: "¿Cómo sé cuál de las cuatro es mi caso?", parrafos: ["..."] }],
  faq: [
    { pregunta: "¿Cuánto tarda en dar resultados?", respuesta: "..." },
    { pregunta: "¿Pausar la campaña ayuda?", respuesta: "..." },
    { pregunta: "¿Conviene subir el presupuesto?", respuesta: "..." },
  ],
  datoPropio: {
    caso: "centro-servicio-electrodomesticos-cdmx",
    plantilla: "Un {industria} en {ciudad} recibió {contactos} contactos a {costoPorContacto} cada uno.",
  },
  hermanas: [],
  casoExito: null,
  actualizado: "2026-09",
};

describe("guiasAds (registro)", () => {
  it("no hay slugs repetidos", () => {
    const slugs = guiasAds.map((g) => g.slug);
    expect(slugs.length).toBe(new Set(slugs).size);
  });

  it("toda guia del registro es publicable", () => {
    const ctx = contexto(guiasAds);
    const fallas = guiasAds.flatMap((g) => validarGuia(g, ctx).map((f) => `${g.slug}: ${f}`));
    expect(fallas).toEqual([]);
  });

  it("buscarGuia devuelve null si no existe", () => {
    expect(buscarGuia("no-existe")).toBeNull();
  });
});

describe("validarGuia (las reglas del spec §5, probadas con fixtures)", () => {
  const ctx = contexto([valida]);

  it("acepta una guia que cumple todo", () => {
    expect(validarGuia(valida, ctx)).toEqual([]);
  });

  it("rechaza un slug con mayusculas o espacios", () => {
    expect(validarGuia({ ...valida, slug: "Mi Guia" }, ctx)).toContainEqual(expect.stringContaining("slug inválido"));
  });

  it("rechaza un slug que ya existe como guia estatica", () => {
    const estatica = [...ctx.estaticas][0];
    expect(validarGuia({ ...valida, slug: estatica }, ctx)).toContainEqual(expect.stringContaining("choca"));
  });

  it("rechaza una respuesta directa demasiado corta", () => {
    const corta = { ...valida, respuestaDirecta: "Gasta sin vender porque mide mal." };
    expect(validarGuia(corta, ctx)).toContainEqual(expect.stringContaining("palabras"));
  });

  it("rechaza una respuesta directa que abre con relleno", () => {
    const relleno = { ...valida, respuestaDirecta: `En este artículo veremos ${valida.respuestaDirecta}` };
    expect(validarGuia(relleno, ctx)).toContainEqual(expect.stringContaining("relleno"));
  });

  it("rechaza una plantilla sin ninguna cifra", () => {
    const sinCifra = { ...valida, datoPropio: { ...valida.datoPropio, plantilla: "Un {industria} en {ciudad}." } };
    expect(validarGuia(sinCifra, ctx)).toContainEqual(expect.stringContaining("sin ninguna cifra"));
  });

  it("rechaza un placeholder desconocido (se imprimiria literal)", () => {
    const typo = { ...valida, datoPropio: { ...valida.datoPropio, plantilla: "{contactos} contactos a {costo} cada uno." } };
    expect(validarGuia(typo, ctx)).toContainEqual("placeholder desconocido: {costo}");
  });

  it("rechaza hermanas que no existen o que apuntan a si misma", () => {
    expect(validarGuia({ ...valida, hermanas: ["no-existe"] }, ctx)).toContainEqual(expect.stringContaining("hermana inexistente"));
    expect(validarGuia({ ...valida, hermanas: [valida.slug] }, ctx)).toContainEqual("hermana apunta a sí misma");
  });

  it("rechaza menos de 3 preguntas frecuentes y fechas mal formadas", () => {
    expect(validarGuia({ ...valida, faq: valida.faq.slice(0, 2) }, ctx)).toContainEqual(expect.stringContaining("faq"));
    expect(validarGuia({ ...valida, actualizado: "septiembre 2026" }, ctx)).toContainEqual(expect.stringContaining("actualizado"));
  });
});
