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
  secciones: [{ titulo: "¿Cómo sé cuál de las cuatro es mi caso?", parrafos: ["..."] }],
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

const SITE = "https://indexaia.com";
const graph = buildGuiaGraph(guia, SITE);
const nodos = graph["@graph"];

/** Nodo del grafo por `@type`, tipado por el discriminante. */
function nodo<T extends (typeof nodos)[number]["@type"]>(tipo: T) {
  const n = nodos.find((x) => x["@type"] === tipo);
  if (!n) throw new Error(`no hay nodo ${tipo}`);
  return n as Extract<(typeof nodos)[number], { "@type": T }>;
}

describe("buildGuiaGraph", () => {
  it("incluye Organization, Article, FAQPage y BreadcrumbList", () => {
    expect(nodos.map((n) => n["@type"])).toEqual(["Organization", "Article", "FAQPage", "BreadcrumbList"]);
  });

  it("declara la Organization una vez y la referencia por @id", () => {
    const org = nodo("Organization");
    const article = nodo("Article");
    expect(org["@id"]).toBe(`${SITE}/#organization`);
    expect(org.name).toBe("INDEXA");
    expect(article.author).toEqual({ "@id": org["@id"] });
    expect(article.publisher).toEqual({ "@id": org["@id"] });
  });

  it("el Article lleva fechas, url, imagen y página principal", () => {
    const article = nodo("Article");
    expect(article.datePublished).toBe("2026-09-01");
    expect(article.dateModified).toBe("2026-09-01");
    expect(article.url).toBe(`${SITE}/guia/${guia.slug}`);
    expect(article.mainEntityOfPage).toBe(`${SITE}/guia/${guia.slug}`);
    expect(article.image).toEqual({ "@type": "ImageObject", url: `${SITE}/og-image.png` });
  });

  it("el idioma sigue al mercado", () => {
    expect(nodo("Article").inLanguage).toBe("es-MX");
    const usa = buildGuiaGraph({ ...guia, mercado: "usa" }, SITE)["@graph"].find((n) => n["@type"] === "Article");
    expect(usa && "inLanguage" in usa ? usa.inLanguage : null).toBe("es-US");
  });

  it("el FAQPage trae una Question por cada FAQ", () => {
    const faq = nodo("FAQPage");
    expect(faq.mainEntity).toHaveLength(3);
    expect(faq.mainEntity[0]["@type"]).toBe("Question");
    expect(faq.mainEntity[0].acceptedAnswer["@type"]).toBe("Answer");
    expect(faq.mainEntity[1].name).toBe(guia.faq[1].pregunta);
  });

  it("el breadcrumb va INDEXA > Guias > la guia, y el ultimo item no lleva url", () => {
    const bc = nodo("BreadcrumbList");
    expect(bc.itemListElement).toHaveLength(3);
    expect(bc.itemListElement[0].item).toBe(SITE);
    expect(bc.itemListElement[1].item).toBe(`${SITE}/guia`);
    expect(bc.itemListElement[2].name).toBe(guia.h1);
    expect(bc.itemListElement[2]).not.toHaveProperty("item");
  });
});
