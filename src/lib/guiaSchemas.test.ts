import { describe, expect, it } from "vitest";
import type { GuiaAds } from "./guiasAdsData";
import { buildGuiaGraph } from "./guiaSchemas";

const guia: GuiaAds = {
  slug: "por-que-mi-campana-de-google-ads-no-vende",
  mercado: "mx",
  familia: "diagnostico",
  seoTitle: "Por qué mi campaña de Google Ads no vende (y cómo saber la causa)",
  seoDescription:
    "Las cuatro causas reales por las que una campaña de Google Ads gasta sin generar ventas, cómo distinguirlas con datos de tu propia cuenta, y qué hacer con cada una.",
  h1: "Por qué mi campaña de Google Ads no vende",
  respuestaDirecta:
    "Una campaña de Google Ads que gasta sin vender casi siempre falla por una de cuatro causas: las conversiones no están bien medidas, las palabras clave atraen a quien no compra, la página de destino no convierte, o el presupuesto se reparte entre demasiadas campañas. Se distinguen revisando cuatro números concretos de tu cuenta.",
  secciones: [
    { titulo: "¿Cómo sé cuál de las cuatro es mi caso?", parrafos: ["..."] },
  ],
  faq: [
    { pregunta: "¿Cuánto tarda en dar resultados?", respuesta: "..." },
    { pregunta: "¿Pausar la campaña ayuda?", respuesta: "..." },
    { pregunta: "¿Conviene subir el presupuesto?", respuesta: "..." },
  ],
  datoPropio: { caso: "centro-servicio-electrodomesticos-cdmx", plantilla: "{contactos} contactos" },
  hermanas: [],
  casoExito: null,
  actualizado: "2026-09",
};

describe("buildGuiaGraph", () => {
  const graph = buildGuiaGraph(guia, "https://indexaia.com");
  const tipos = graph["@graph"].map((n) => n["@type"]);

  it("incluye Article, FAQPage y BreadcrumbList", () => {
    expect(tipos).toContain("Article");
    expect(tipos).toContain("FAQPage");
    expect(tipos).toContain("BreadcrumbList");
  });

  it("el Article lleva fechas y autor", () => {
    const article = graph["@graph"].find((n) => n["@type"] === "Article")!;
    expect(article.datePublished).toMatch(/^\d{4}-\d{2}/);
    expect(article.dateModified).toMatch(/^\d{4}-\d{2}/);
    expect(article.author.name).toBe("INDEXA");
    expect(article.mainEntityOfPage).toBe(
      "https://indexaia.com/guia/por-que-mi-campana-de-google-ads-no-vende"
    );
  });

  it("el FAQPage trae una Question por cada FAQ", () => {
    const faq = graph["@graph"].find((n) => n["@type"] === "FAQPage")!;
    expect(faq.mainEntity).toHaveLength(3);
    expect(faq.mainEntity[0]["@type"]).toBe("Question");
    expect(faq.mainEntity[0].acceptedAnswer["@type"]).toBe("Answer");
  });

  it("el breadcrumb va INDEXA > Guias > la guia", () => {
    const bc = graph["@graph"].find((n) => n["@type"] === "BreadcrumbList")!;
    expect(bc.itemListElement).toHaveLength(3);
    expect(bc.itemListElement[2].name).toBe(guia.h1);
  });
});
