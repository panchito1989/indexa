import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { whatsappUrl } from "@/lib/contact";
import { guiasAds } from "@/lib/guiasAdsData";

const PAGE_PATH = "/administracion-de-campanas-usa";
const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://indexaia.com";
const SITE_URL = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

export const metadata: Metadata = {
  title: "Manejo de Anuncios de Google, Meta y TikTok Ads para Negocios Hispanos en USA | INDEXA",
  description:
    "INDEXA maneja tus anuncios de Google, Meta y TikTok Ads en Estados Unidos: estructura, presupuesto, creativos, medición de contactos y reporte mensual en español. La plataforma tiene planes en USD; que nuestro equipo opere tu cuenta se cotiza según tu inversión.",
  keywords: [
    "manejo de anuncios para negocios hispanos usa",
    "quien administra mis campañas de google ads en usa",
    "agencia hispana de publicidad digital usa",
    "administracion de google ads meta ads tiktok ads usa",
    "publicidad en español houston dallas miami phoenix atlanta",
  ],
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: "Manejo de Anuncios de Google, Meta y TikTok Ads — INDEXA USA",
    description:
      "Operamos tus campañas de Google, Meta y TikTok Ads día a día, en español. Tú recibes los contactos por WhatsApp.",
    url: `${SITE_URL}${PAGE_PATH}`,
    locale: "es_US",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

const RESPUESTA_DIRECTA =
  "Manejar tus anuncios significa que el equipo de INDEXA opera tus campañas de Google, Meta y TikTok Ads: arma la estructura, ajusta presupuesto y pujas, produce los creativos y mide qué genera contactos reales. Es para dueños de negocios hispanos en USA que ya gastaron en publicidad sin resultados o prefieren enfocarse en su negocio en vez de aprender a administrar campañas.";

const CIUDADES = ["Houston", "Dallas", "Miami", "Phoenix", "Atlanta"];

const queIncluye = [
  {
    titulo: "Estructura de campañas",
    desc: "Cómo se organizan campañas, grupos de anuncios y públicos para que cada dólar se dirija al servicio correcto.",
    emoji: "🗂️",
  },
  {
    titulo: "Presupuestos y pujas",
    desc: "Cuánto se invierte por campaña en dólares y cómo se ajustan las pujas para bajar el costo por contacto.",
    emoji: "💵",
  },
  {
    titulo: "Creativos",
    desc: "Anuncios de texto, imágenes y video en español (o bilingües, según tu zona) adaptados a Google, Meta y TikTok.",
    emoji: "🎨",
  },
  {
    titulo: "Medición de conversiones",
    desc: "Seguimiento de clics a WhatsApp y llamadas para saber qué campaña realmente genera contactos, no solo clics.",
    emoji: "📈",
  },
  {
    titulo: "Optimización continua",
    desc: "Revisión semanal de qué funciona y qué se pausa, sin esperar al reporte mensual para reaccionar.",
    emoji: "🔁",
  },
  {
    titulo: "Reporte mensual",
    desc: "Un resumen claro en español: inversión, contactos y costo por contacto — sin jerga técnica.",
    emoji: "📊",
  },
];

const paraQuienEs = [
  "Ya gastaste dinero en Facebook, Google o TikTok Ads y no viste resultados claros.",
  "No sabes qué es un ROAS, un CPC o un CPL, y nadie te lo ha explicado en español.",
  "No tienes tiempo de aprender la plataforma mientras manejas tu negocio en USA.",
  "Prefieres hablar con alguien que entienda tu mercado, tu comunidad y tu idioma.",
];

const faqUsa: { pregunta: string; respuesta: string }[] = [
  {
    pregunta: "¿Cuánto cuesta que INDEXA maneje mis anuncios?",
    respuesta:
      "La plataforma de INDEXA tiene planes en dólares — puedes verlos completos en nuestra página para USA. Que nuestro equipo opere tu cuenta de anuncios día a día es un servicio aparte, sin tarifa fija: se cotiza según cuánto inviertes en publicidad, partiendo de ahí, y se define en una llamada inicial.",
  },
  {
    pregunta: "¿Qué es un ROAS o un CPL, y por qué debería importarme?",
    respuesta:
      "ROAS es cuánto generas por cada dólar que gastas en anuncios; CPL es cuánto te cuesta cada contacto. Si no sabes calcularlos, es normal — para eso existe este servicio: te traducimos esos números a algo simple, cuántos contactos llegaron por WhatsApp o llamada y a qué costo cada uno.",
  },
  {
    pregunta: "Ya gasté dinero en Facebook o Google Ads y no funcionó. ¿Qué hacen distinto?",
    respuesta:
      "Revisamos tu cuenta actual antes que nada: cómo está midiendo las conversiones, a quién le están llegando los anuncios, y si tu página realmente convierte esas visitas en contactos. La mayoría de las cuentas que gastan sin resultado tienen mal configurada una de esas tres cosas.",
  },
  {
    pregunta: "¿En qué ciudades de Estados Unidos trabajan?",
    respuesta:
      "Con negocios hispanos en Houston, Dallas, Miami, Phoenix, Atlanta y el resto de Estados Unidos. Las campañas se segmentan por zona de servicio, así que no importa si tu ciudad no está en esta lista.",
  },
  {
    pregunta: "¿Hablan español? ¿Quién maneja mis campañas?",
    respuesta:
      "Todo el equipo que administra tu cuenta habla español. Te explicamos el reporte mensual en español, sin jerga técnica, y respondes dudas por WhatsApp con una persona, no con un bot.",
  },
  {
    pregunta: "¿Trabajan con Google, Meta y TikTok Ads, o solo uno?",
    respuesta:
      "Los tres. La combinación depende de tu industria y tu ciudad, y se decide en la asesoría inicial — no antes, para no gastar tu presupuesto probando canales al azar.",
  },
];

export default function AdministracionDeCampanasUsaPage() {
  const guiasUsa = guiasAds.filter((g) => g.mercado === "usa");

  const organizationId = `${SITE_URL}/#organization`;
  const pageUrl = `${SITE_URL}${PAGE_PATH}`;

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization" as const,
        "@id": organizationId,
        name: "INDEXA",
        url: SITE_URL,
      },
      {
        "@type": "Service" as const,
        "@id": `${pageUrl}#service`,
        serviceType: "Administración de campañas de publicidad digital (Google Ads, Meta Ads, TikTok Ads)",
        name: "Manejo de anuncios de Google, Meta y TikTok Ads para negocios hispanos en USA",
        description:
          "INDEXA opera las campañas de Google, Meta y TikTok Ads de negocios hispanos en Estados Unidos: estructura, presupuesto y pujas, creativos, medición de conversiones, optimización continua y reporte mensual en español.",
        provider: { "@id": organizationId },
        areaServed: [
          { "@type": "Country", name: "United States" },
          ...CIUDADES.map((ciudad) => ({
            "@type": "City" as const,
            name: ciudad,
            containedInPlace: { "@type": "Country" as const, name: "United States" },
          })),
        ],
        audience: {
          "@type": "BusinessAudience",
          audienceType: "Negocios hispanos y latinos en Estados Unidos que ya invierten o quieren invertir en publicidad digital",
        },
        offers: [
          {
            "@type": "Offer",
            name: "Plataforma INDEXA (planes en USD)",
            url: `${SITE_URL}/usa`,
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
          },
          {
            "@type": "Offer",
            name: "Administración de campañas (Google, Meta y TikTok Ads)",
            description:
              "INDEXA opera la cuenta de anuncios del cliente día a día. Se cotiza según la inversión publicitaria del cliente, partiendo de ahí, y se define en la asesoría inicial; no tiene precio fijo en dólares.",
          },
        ],
        url: pageUrl,
        inLanguage: "es-US",
      },
      {
        "@type": "FAQPage" as const,
        mainEntity: faqUsa.map((f) => ({
          "@type": "Question",
          name: f.pregunta,
          acceptedAnswer: { "@type": "Answer", text: f.respuesta },
        })),
      },
      {
        "@type": "BreadcrumbList" as const,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "INDEXA", item: SITE_URL },
          {
            "@type": "ListItem",
            position: 2,
            name: "Manejo de anuncios para negocios hispanos en USA",
          },
        ],
      },
    ],
  };

  const jsonLd = JSON.stringify(graph).replace(/</g, "\\u003c");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <Header />
      <main className="bg-[#050816] text-white">
        {/* HERO + RESPUESTA DIRECTA */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.07]">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,102,0,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,102,0,0.3) 1px, transparent 1px)",
                backgroundSize: "60px 60px",
              }}
            />
          </div>
          <div className="absolute top-1/4 left-1/4 h-[500px] w-[500px] rounded-full bg-indexa-blue/20 blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-indexa-orange/15 blur-[120px]" />

          <div className="relative mx-auto max-w-5xl px-4 pt-28 pb-20 sm:px-6 text-center lg:pt-32">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-white/70 backdrop-blur-sm">
              <span>🇺🇸</span>
              Manejo de anuncios · Google, Meta y TikTok Ads
            </div>

            <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              Manejamos tus anuncios{" "}
              <span className="bg-gradient-to-r from-indexa-orange via-orange-400 to-amber-300 bg-clip-text text-transparent">
                para que tú no tengas que aprender
              </span>
            </h1>

            <p className="mx-auto mt-7 max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-6 text-left text-lg leading-relaxed text-white/85 backdrop-blur-sm sm:text-xl">
              {RESPUESTA_DIRECTA}
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href={whatsappUrl(
                  "Hola, quiero información sobre el manejo de mis campañas de Google, Meta y TikTok Ads (USA)."
                )}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-8 py-4 text-lg font-bold text-white shadow-2xl shadow-emerald-500/25 transition-all hover:-translate-y-0.5"
              >
                Hablar por WhatsApp
              </a>
              <a
                href="#incluye"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-8 py-4 text-lg font-bold backdrop-blur-sm transition-all hover:bg-white/10"
              >
                Ver qué incluye
              </a>
            </div>
            <p className="mt-3 text-sm text-white/40">Actualizado: septiembre 2026</p>
          </div>
        </section>

        {/* LA FRONTERA: PLATAFORMA VS. ADMINISTRACIÓN */}
        <section id="precio" className="relative bg-[#070b1f] py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <p className="text-sm font-bold uppercase tracking-wider text-indexa-orange">Cómo se cobra esto</p>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">¿Cuánto cuesta que INDEXA maneje mis anuncios?</h2>
            <p className="mt-6 text-lg leading-relaxed text-white/80">
              Aquí también separamos las dos cosas, para que sepas exactamente qué estás pagando.
            </p>
            <div className="mt-6 rounded-2xl border border-indexa-orange/30 bg-indexa-orange/10 p-6 sm:p-8">
              <p className="text-lg leading-relaxed text-white sm:text-xl">
                La <strong>plataforma</strong> de INDEXA tiene planes en dólares, pensados para que tú mismo actives
                y ajustes tus campañas con ayuda de IA — puedes ver todos los planes en{" "}
                <Link href="/usa" className="underline decoration-indexa-orange/60 underline-offset-4 hover:text-indexa-orange">
                  nuestra página para USA
                </Link>
                . Que el equipo de INDEXA opere tus campañas de Google, Meta y TikTok Ads día a día es un{" "}
                <strong>servicio aparte</strong>: no tiene una tarifa fija en dólares, se cotiza según tu inversión
                publicitaria, partiendo de ahí, y se define en una asesoría inicial.
              </p>
            </div>
          </div>
        </section>

        {/* QUÉ INCLUYE */}
        <section id="incluye" className="relative bg-[#050816] py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-wider text-indexa-orange">Qué incluye</p>
              <h2 className="mt-3 text-3xl font-extrabold sm:text-5xl">Qué incluye el manejo de tus anuncios</h2>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {queIncluye.map((item) => (
                <div key={item.titulo} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                  <div className="mb-4 text-3xl">{item.emoji}</div>
                  <h3 className="text-lg font-bold">{item.titulo}</h3>
                  <p className="mt-2 text-sm text-white/65">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PARA QUIÉN ES */}
        <section className="relative bg-[#070b1f] py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <p className="text-sm font-bold uppercase tracking-wider text-indexa-orange">Para quién es</p>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">¿Es esto para tu negocio?</h2>
            <ul className="mt-8 space-y-4">
              {paraQuienEs.map((punto) => (
                <li key={punto} className="flex items-start gap-3 text-white/85">
                  <span className="mt-1 text-indexa-orange">✓</span>
                  <span className="text-lg leading-relaxed">{punto}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CIUDADES */}
        <section className="relative bg-[#050816] py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-indexa-orange">Cobertura</p>
            <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">
              Trabajamos con negocios hispanos en toda USA
            </h2>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              {CIUDADES.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80"
                >
                  {c}
                </span>
              ))}
            </div>
            <p className="mt-6 text-sm text-white/45">
              ¿No ves tu ciudad? Trabajamos en toda USA. Escríbenos por WhatsApp.
            </p>
          </div>
        </section>

        {/* GUÍAS DEL CLUSTER */}
        <section className="relative bg-[#070b1f] py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <p className="text-sm font-bold uppercase tracking-wider text-indexa-orange">Guías</p>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">Aprende a leer tus propias campañas</h2>
            {guiasUsa.length > 0 ? (
              <ul className="mt-8 grid gap-4 sm:grid-cols-2">
                {guiasUsa.map((g) => (
                  <li key={g.slug}>
                    <Link
                      href={`/guia/${g.slug}`}
                      className="block rounded-xl border border-white/10 bg-white/5 p-5 transition-colors hover:bg-white/10"
                    >
                      <p className="font-semibold text-white">{g.h1}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 text-lg text-white/60">
                Estamos publicando las primeras guías de este cluster para dueños de negocio hispanos en USA —
                presupuesto en dólares, ROAS y cómo leer tu propia cuenta. Vuelve pronto.
              </p>
            )}
          </div>
        </section>

        {/* FAQ + CTA FINAL */}
        <section className="relative bg-[#050816] py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-wider text-indexa-orange">Preguntas frecuentes</p>
              <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">Lo que más nos preguntan</h2>
            </div>
            <div className="mt-12 space-y-4">
              {faqUsa.map((q) => (
                <details
                  key={q.pregunta}
                  className="group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm open:bg-white/[0.07]"
                >
                  <summary className="flex cursor-pointer items-start justify-between gap-4 text-base font-bold text-white">
                    {q.pregunta}
                    <span className="ml-2 mt-1 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-white/20 text-sm transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-4 text-sm leading-relaxed text-white/70">{q.respuesta}</p>
                </details>
              ))}
            </div>

            <div className="mt-14 rounded-3xl border border-indexa-orange/30 bg-gradient-to-br from-indexa-orange/10 via-orange-500/5 to-amber-400/10 p-8 text-center backdrop-blur-sm sm:p-12">
              <h3 className="text-2xl font-extrabold sm:text-3xl">¿Listo para que manejemos tus anuncios?</h3>
              <p className="mx-auto mt-3 max-w-xl text-white/70">
                Cuéntanos tu inversión actual y te decimos, en una llamada en español, cómo se cotiza que INDEXA
                opere tu cuenta.
              </p>
              <a
                href={whatsappUrl(
                  "Hola, quiero información sobre el manejo de mis campañas de Google, Meta y TikTok Ads (USA)."
                )}
                target="_blank"
                rel="noreferrer"
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-8 py-4 text-base font-bold text-white shadow-2xl shadow-emerald-500/25 transition-all hover:-translate-y-0.5"
              >
                Hablar por WhatsApp →
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
