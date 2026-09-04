import type { MetadataRoute } from "next";

const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://indexaia.com";
const SITE_URL = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

/** Nunca indexable: paneles internos y API. */
const PRIVATE_PATHS = ["/admin/", "/agency/", "/dashboard/", "/api/"];

/**
 * Crawlers de IA permitidos.
 *
 * GPTBot y ClaudeBot son de entrenamiento; OAI-SearchBot, ChatGPT-User,
 * Claude-User y Claude-SearchBot son los que consultan en vivo cuando un
 * usuario pregunta. Sin estos últimos no aparecemos en las respuestas.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
  "meta-externalagent",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/sitio/", "/demo/", "/login", "/registro"],
        disallow: PRIVATE_PATHS,
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: ["/", "/sitio/", "/llms.txt"],
        disallow: PRIVATE_PATHS,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
