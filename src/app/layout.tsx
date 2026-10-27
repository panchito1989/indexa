import type { Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import "./globals.css";
import WhatsAppFloat from "@/components/WhatsAppFloat";
import { WHATSAPP_NUMBER, whatsappUrl } from "@/lib/contact";
import { jsonLdHtml } from "@/lib/jsonLd";
import { planOfferMx } from "@/lib/pricing";

// NOTA: el `export const dynamic = "force-dynamic"` global se removió porque
// rompía SSG/ISR para AI crawlers (GPTBot, ClaudeBot, PerplexityBot priorizan
// respuestas rápidas/cacheables). Las rutas autenticadas ya declaran su propio
// `dynamic` cuando lo necesitan (admin, dashboard, agency, webhooks).

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://indexaia.com";
const SITE_URL = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "INDEXA — Presencia Digital para tu Negocio",
    template: "%s | INDEXA",
  },
  description:
    "Creamos tu página web profesional, tienda en línea y estrategia SEO. Llevamos clientes a tu puerta, mientras tú te enfocas en vender.",
  keywords: ["presencia digital", "páginas web", "PYMES", "SEO", "e-commerce", "México", "sitio web", "WhatsApp", "Google"],
  authors: [{ name: "INDEXA", url: SITE_URL }],
  creator: "INDEXA",
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "INDEXA",
    title: "INDEXA — Presencia Digital para tu Negocio",
    description: "Creamos tu página web profesional, tienda en línea y estrategia SEO. Llevamos clientes a tu puerta.",
    url: SITE_URL,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "INDEXA — Presencia Digital con IA para PYMES en México",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "INDEXA — Presencia Digital para tu Negocio",
    description: "Creamos tu página web profesional, tienda en línea y estrategia SEO.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
  verification: {
    google: "y0BHgajYf3avZIOM05e8GMw8dulp2mr4bBGx6sA7Npc",
  },
};

// ── JSON-LD de sitio: Organization + WebSite + SoftwareApplication ────
// Un solo @graph con entidades enlazadas por @id. `#organization` es la
// misma entidad que citan guías, hubs y páginas de servicio (`guiaSchemas`,
// `seoSchemas`), así Google y los modelos de IA resuelven una sola entidad.
//
// Sin `aggregateRating`: no hay reseñas verificables que lo respalden y las
// valoraciones autoservidas sin fuente son motivo de acción manual. La prueba
// social del sitio es el caso real de `casos-ads.json`.
//
// El WebPage de la home (speakable) vive en `src/app/page.tsx`: aquí se
// repetía, con la URL de la home, en todas las páginas.
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

const siteJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: "INDEXA",
      // Variantes con las que se busca la marca (dominio indexaia.com).
      alternateName: ["Indexa IA", "indexaia"],
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo.png`,
        width: 512,
        height: 512,
      },
      image: `${SITE_URL}/og-image.png`,
      description:
        "Plataforma de presencia digital con inteligencia artificial para PYMES en México y negocios hispanos en Estados Unidos: sitios web profesionales, SEO local y administración de campañas en Google Ads, Meta Ads y TikTok Ads.",
      foundingDate: "2024",
      areaServed: [
        { "@type": "Country", name: "México" },
        { "@type": "Country", name: "Estados Unidos" },
      ],
      knowsLanguage: ["es-MX", "es-US"],
      knowsAbout: [
        "Google Ads",
        "Meta Ads",
        "TikTok Ads",
        "SEO local",
        "Páginas web para PYMES",
        "WhatsApp Business",
      ],
      sameAs: [
        "https://www.facebook.com/indexamx",
        "https://www.instagram.com/indexamx",
        "https://www.tiktok.com/@indexamx",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "sales",
        telephone: `+${WHATSAPP_NUMBER}`,
        url: whatsappUrl("Hola, quiero información sobre INDEXA"),
        availableLanguage: ["es"],
        areaServed: ["MX", "US"],
      },
    },
    {
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      url: SITE_URL,
      name: "INDEXA",
      inLanguage: "es-MX",
      publisher: { "@id": ORGANIZATION_ID },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: "INDEXA",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      description:
        "Plataforma con IA que crea sitios web profesionales para PYMES en minutos, con SEO local automático y WhatsApp integrado.",
      offers: planOfferMx,
      publisher: { "@id": ORGANIZATION_ID },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <meta name="theme-color" content="#FF6600" />
        <meta name="geo.region" content="MX" />
        <meta name="geo.placename" content="México" />
        <meta name="language" content="es-MX" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(siteJsonLd) }}
        />
      </head>
      <body className={`${inter.variable} antialiased`}>
        {children}
        <WhatsAppFloat />
        {/*
          Vercel Web Analytics por script directo (mismo origen, pasa la CSP).
          Se evita el paquete @vercel/analytics porque sus peer deps opcionales
          (Svelte/Vite 8) chocan con vitest y romperían el npm ci del deploy.
          Sólo en producción: en dev y previews el script no existe (404).
          Sin esto no hay forma de saber si un clic viene de Google, ChatGPT
          o Perplexity. Requiere habilitar Analytics en el panel de Vercel.
        */}
        {process.env.VERCEL_ENV === "production" && (
          <Script src="/_vercel/insights/script.js" strategy="afterInteractive" />
        )}
      </body>
    </html>
  );
}
