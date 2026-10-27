import Header from "@/components/Header";

import Hero from "@/components/Hero";
import Solutions from "@/components/Solutions";
import WhyConverts from "@/components/WhyConverts";
import HowItWorks from "@/components/HowItWorks";
import Pricing from "@/components/Pricing";
import ResultadosReales from "@/components/ResultadosReales";
import ContactForm from "@/components/ContactForm";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";
import { jsonLdHtml } from "@/lib/jsonLd";

const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://indexaia.com";
const SITE_URL = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

// WebPage de la home (antes vivía en el layout y se repetía, con la URL de la
// home, en todas las páginas del sitio). Enlaza con el WebSite y la
// Organization que declara el layout por @id.
const webPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${SITE_URL}/#webpage`,
  url: SITE_URL,
  name: "INDEXA — Presencia Digital para tu Negocio",
  inLanguage: "es-MX",
  isPartOf: { "@id": `${SITE_URL}/#website` },
  about: { "@id": `${SITE_URL}/#organization` },
  speakable: {
    "@type": "SpeakableSpecification",
    cssSelector: ["h1", ".hero-description", "#faq h2", "#faq [data-faq-answer]"],
  },
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(webPageJsonLd) }} />
      <Header />
      <main>
        <Hero />
        <Solutions />
        <WhyConverts />
        <HowItWorks />
        <Pricing />
        <ResultadosReales />
        <FAQ />
        <ContactForm />
      </main>
      <Footer />
    </>
  );
}
