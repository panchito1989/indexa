import type { MetadataRoute } from "next";

/**
 * Registro de las páginas estáticas que entran al sitemap.
 *
 * Reglas (las comprueba `sitemapEstatico.test.ts`):
 * - cada ruta tiene su `src/app/<ruta>/page.tsx`;
 * - ninguna está en `REDIRECCIONES_LEGACY` (un sitemap nunca debe listar 301/404);
 * - `lastModified` sólo cuando la fecha es real. Antes todas llevaban
 *   `new Date()` del build: Google deja de confiar en un lastmod que cambia
 *   en cada despliegue, así que es peor que omitirlo.
 *
 * Las páginas de servicios, las guías de ads y los sitios de clientes se
 * derivan de sus propios registros en `src/app/sitemap.ts`.
 */

type Frecuencia = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

export interface PaginaEstatica {
  path: string;
  changeFrequency: Frecuencia;
  priority: number;
  /** YYYY-MM-DD de la última revisión real del contenido. */
  lastModified?: string;
}

const p = (
  path: string,
  changeFrequency: Frecuencia,
  priority: number,
  lastModified?: string,
): PaginaEstatica => ({ path, changeFrequency, priority, lastModified });

export const PAGINAS_ESTATICAS: readonly PaginaEstatica[] = [
  p("/", "weekly", 1, "2026-10-26"),
  p("/probar", "weekly", 0.95),
  p("/registro", "monthly", 0.4),
  p("/agencias", "monthly", 0.9),
  p("/casos-de-exito", "monthly", 0.9, "2026-10-26"),
  p("/directorio", "weekly", 0.8),
  p("/privacidad", "yearly", 0.2),
  p("/terminos", "yearly", 0.2),
  p("/cookies", "yearly", 0.2),

  // Guías estáticas (las guías de ads salen del registro `guiasAds`).
  p("/guia", "weekly", 0.9),
  p("/guia/presencia-digital-pymes", "monthly", 0.9),
  p("/guia/seo-local-mexico", "monthly", 0.8),
  p("/guia/marketing-digital-pymes", "monthly", 0.8),
  p("/guia/google-mi-negocio", "monthly", 0.8),
  p("/guia/beneficios-pagina-web", "monthly", 0.8),
  p("/guia/como-elegir-pagina-web", "monthly", 0.7),
  p("/guia/que-incluye-indexa", "monthly", 0.7),
  p("/guia/whatsapp-business-pymes", "monthly", 0.7),
  p("/guia/preguntas-frecuentes", "monthly", 0.7),
  p("/guia/mejor-plataforma-pagina-web-pymes-mexico-2026", "monthly", 0.9),
  p("/guia/pagina-web-dentista-mexico-cuanto-cuesta", "monthly", 0.9),
  p("/guia/comparativa-indexa-vs-wix-vs-godaddy", "monthly", 0.9),
  p("/guia/indexa-vs-wordpress-vs-wix-pymes-mexico", "monthly", 0.95),
  p("/guia/whatsapp-business-api-precio-mexico", "monthly", 0.95),
  p("/guia/factura-pagina-web-deducible-mexico", "monthly", 0.95),

  // Única landing de ciudad que queda: tiene un caso real local.
  p("/pagina-web-cdmx", "monthly", 0.8, "2026-10-26"),

  // Landings por giro.
  p("/sitio-web-restaurante", "monthly", 0.85),
  p("/sitio-web-dentista", "monthly", 0.85),
  p("/sitio-web-taller-mecanico", "monthly", 0.85),

  // Pillar pages "Agencia".
  p("/agencia-de-marketing-digital", "weekly", 1),
  p("/agencia-de-publicidad", "weekly", 1),
  p("/agencia-google-ads", "weekly", 0.95),
  p("/agencia-de-seo", "weekly", 0.95),

  // USA-Hispano.
  p("/usa", "weekly", 0.95),
  p("/mecanicos-usa", "monthly", 0.9),
  p("/landscaping-usa", "monthly", 0.9),
  p("/limpieza-usa", "monthly", 0.9),
  p("/construccion-usa", "monthly", 0.9),
  p("/plomeros-usa", "monthly", 0.9),

  // Hubs de administración de campañas: destino comercial del cluster.
  p("/administracion-de-campanas", "weekly", 1, "2026-09-04"),
  p("/administracion-de-campanas-usa", "weekly", 1, "2026-09-04"),
];
