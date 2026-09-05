import { describe, expect, it } from "vitest";
import { casos } from "./casosAds";
import { renderDatoPropio, sustituirPlaceholders } from "./datoPropio";
import type { GuiaAds } from "./guiasAdsData";

const caso = casos()[0];

function guiaCon(plantilla: string, slugCaso = caso.slug): GuiaAds {
  return {
    slug: "guia-de-prueba",
    mercado: "mx",
    familia: "presupuesto",
    seoTitle: "Título de prueba suficientemente largo",
    seoDescription: "Descripción de prueba suficientemente larga para pasar cualquier validación de longitud.",
    h1: "Encabezado de prueba",
    respuestaDirecta: "...",
    secciones: [],
    faq: [],
    datoPropio: { caso: slugCaso, plantilla },
    hermanas: [],
    casoExito: null,
    actualizado: "2026-09",
  };
}

describe("sustituirPlaceholders", () => {
  it("sustituye todas las apariciones, no solo la primera", () => {
    const texto = sustituirPlaceholders("{contactos} contactos; sí, {contactos}.", caso);
    expect(texto).toBe(`${caso.metricas.contactos} contactos; sí, ${caso.metricas.contactos}.`);
  });

  it("sustituye los seis placeholders con formato", () => {
    const texto = sustituirPlaceholders(
      "{inversion}|{contactos}|{costoPorContacto}|{tasaContacto}|{industria}|{ciudad}",
      caso
    );
    expect(texto).toBe(
      [
        `$${caso.metricas.inversion.toLocaleString("en-US")} MXN`,
        String(caso.metricas.contactos),
        `$${caso.metricas.costoPorContacto.toLocaleString("en-US")} MXN`,
        `${caso.metricas.tasaContacto.toFixed(0)}%`,
        caso.industria.toLowerCase(),
        caso.ciudad,
      ].join("|")
    );
  });

  it("deja literal un placeholder desconocido en vez de inventar", () => {
    expect(sustituirPlaceholders("a {costo} b", caso)).toBe("a {costo} b");
  });
});

describe("renderDatoPropio", () => {
  it("devuelve null si el caso no existe", () => {
    expect(renderDatoPropio(guiaCon("{contactos}", "no-existe"))).toBeNull();
  });

  it("acompaña el texto con la procedencia del dato", () => {
    const r = renderDatoPropio(guiaCon("{contactos} contactos"));
    expect(r?.texto).toBe(`${caso.metricas.contactos} contactos`);
    expect(r?.nota).toContain("anonimizada");
    expect(r?.nota).toContain(caso.periodo.desde);
    expect(r?.nota).toContain(caso.definicionConversion.toLowerCase());
  });
});
