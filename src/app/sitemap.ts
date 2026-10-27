import type { MetadataRoute } from "next";
import { listCollectionFields } from "@/lib/firestoreRest";
import { guiasAds } from "@/lib/guiasAdsData";
import { servicios } from "@/lib/serviciosData";
import { PAGINAS_ESTATICAS } from "@/lib/sitemapEstatico";

const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://indexaia.com";
const SITE_URL = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Páginas estáticas: el registro vive en sitemapEstatico.ts y su test
  // comprueba que cada ruta exista y que ninguna esté redirigida. Sin
  // `lastModified` salvo cuando la fecha es real (ver el registro).
  const staticPages: MetadataRoute.Sitemap = [
    ...PAGINAS_ESTATICAS.map((p) => ({
      url: p.path === "/" ? SITE_URL : `${SITE_URL}${p.path}`,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
      ...(p.lastModified ? { lastModified: new Date(p.lastModified) } : {}),
    })),
    // Páginas de servicio (intención comercial primaria).
    ...servicios.map((s) => ({
      url: `${SITE_URL}/servicios/${s.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.95,
    })),
    // Cluster de guías de ads — derivadas del registro, nunca a mano.
    ...guiasAds.map((g) => ({
      url: `${SITE_URL}/guia/${g.slug}`,
      // La fecha visible en la guía, no la del build: es lo que un crawler debe leer.
      lastModified: new Date(`${g.actualizado}-01`),
      changeFrequency: "monthly" as const,
      priority: 0.85,
    })),
  ];

  // Dynamic client site pages — fetch all slugs from Firestore
  let sitioPages: MetadataRoute.Sitemap = [];

  try {
    const sitios = await listCollectionFields(
      "sitios",
      ["slug", "nombre", "plan", "statusPago"],
      500,
    );

    // Only include in sitemap microsites that are indexable per the same
    // policy applied in /sitio/[slug] generateMetadata (plan único): any
    // active/published site is indexable — SEO is part of the $699 plan.
    // Inactive/preview sites emit noindex, so they stay out of the sitemap.
    sitioPages = sitios
      .filter((s) => {
        if (!s.data.slug || typeof s.data.slug !== "string") return false;
        const status = (s.data.statusPago as string | undefined) ?? "inactivo";
        return status === "activo" || status === "publicado";
      })
      .map((s) => ({
        url: `${SITE_URL}/sitio/${s.data.slug}`,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      }));
  } catch (err) {
    console.error("Sitemap: error fetching sitios:", err);
  }

  return [...staticPages, ...sitioPages];
}
