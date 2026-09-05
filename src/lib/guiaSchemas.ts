import type { GuiaAds } from "./guiasAdsData";

/**
 * JSON-LD de una guía: Organization + Article + FAQPage + BreadcrumbList en un
 * solo `@graph`, que es el patrón que ya usa `agenciaSeoSchemas.ts`.
 *
 * - La Organization se declara una vez con `@id` y `author`/`publisher` la
 *   referencian, en vez de repetir el objeto.
 * - `datePublished` y `dateModified` salen de `guia.actualizado` ("YYYY-MM"),
 *   con día 01. Es deliberado: Google sólo verá la guía como actualizada cuando
 *   se suba `actualizado`, que es la fecha visible en la página (spec §5.5).
 *   Una corrección de tipografía no mueve la fecha; una revisión de contenido sí.
 * - FAQPage: desde 2023 Google reserva el rich result de FAQ a sitios de gobierno
 *   y salud, pero el schema sigue ayudando a la extracción por modelos de IA,
 *   que es el objetivo de este cluster (spec §6.2).
 * - El último ítem del breadcrumb omite `item` a propósito: es la página actual
 *   y Google lo permite.
 * - Devuelve un objeto plano. Quien lo serialice a `<script type="application/ld+json">`
 *   debe escapar `<` (p. ej. `JSON.stringify(...).replace(/</g, "\\u003c")`) para
 *   que un `</script>` dentro de una respuesta de FAQ no rompa la página.
 */
export function buildGuiaGraph(guia: GuiaAds, siteUrl: string) {
  const url = `${siteUrl}/guia/${guia.slug}`;
  const fecha = `${guia.actualizado}-01`;
  const organizationId = `${siteUrl}/#organization`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization" as const,
        "@id": organizationId,
        name: "INDEXA",
        url: siteUrl,
      },
      {
        "@type": "Article" as const,
        headline: guia.h1,
        description: guia.seoDescription,
        url,
        image: { "@type": "ImageObject", url: `${siteUrl}/og-image.png` },
        author: { "@id": organizationId },
        publisher: { "@id": organizationId },
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
