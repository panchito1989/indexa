import type { GuiaAds } from "./guiasAdsData";

/** JSON-LD de una guía: Article + FAQPage + BreadcrumbList en un @graph. */
export function buildGuiaGraph(guia: GuiaAds, siteUrl: string) {
  const url = `${siteUrl}/guia/${guia.slug}`;
  const fecha = `${guia.actualizado}-01`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article" as const,
        headline: guia.h1,
        description: guia.seoDescription,
        author: { "@type": "Organization", name: "INDEXA", url: siteUrl },
        publisher: { "@type": "Organization", name: "INDEXA", url: siteUrl },
        datePublished: fecha,
        dateModified: fecha,
        mainEntityOfPage: url,
        inLanguage: guia.mercado === "usa" ? "es-US" : "es-MX",
      },
      {
        "@type": "FAQPage" as const,
        mainEntity: guia.faq.map((f) => ({
          "@type": "Question",
          name: f.pregunta,
          acceptedAnswer: { "@type": "Answer", text: f.respuesta },
        })),
      },
      {
        "@type": "BreadcrumbList" as const,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "INDEXA", item: siteUrl },
          { "@type": "ListItem", position: 2, name: "Guías", item: `${siteUrl}/guia` },
          { "@type": "ListItem", position: 3, name: guia.h1 },
        ],
      },
    ],
  };
}
