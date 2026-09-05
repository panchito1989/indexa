import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { whatsappUrl } from "@/lib/contact";
import { planOfferMx } from "@/lib/pricing";
import { guiasAds } from "@/lib/guiasAdsData";
import { buscarCaso, formatoMXN } from "@/lib/casosAds";

const PAGE_PATH = "/administracion-de-campanas";
const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://indexaia.com";
const SITE_URL = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

export const metadata: Metadata = {
  title: "Administración de Campañas de Google, Meta y TikTok Ads",
  description:
    "INDEXA opera tus campañas de Google, Meta y TikTok Ads: estructura, presupuesto, creativos, medición de contactos y reporte mensual. La plataforma son $699 MXN/mes; que nosotros administremos tu cuenta se cotiza según tu inversión, partiendo de ahí.",
  keywords: [
    "administracion de campañas de google ads",
    "administrar google ads meta ads y tiktok ads",
    "agencia que administra mis anuncios",
    "manejo de campañas publicitarias mexico",
    "quien me administra mi cuenta de google ads",
    "administracion de publicidad digital pymes mexico",
  ],
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: "Administración de Campañas de Google, Meta y TikTok Ads — INDEXA",
    description:
      "Operamos tus campañas de Google, Meta y TikTok Ads día a día. Tú recibes los contactos por WhatsApp.",
    url: `${SITE_URL}${PAGE_PATH}`,
    locale: "es_MX",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

const RESPUESTA_DIRECTA =
  "La administración de campañas es el servicio donde INDEXA opera tus anuncios de Google, Meta y TikTok Ads: arma la estructura, define presupuesto y pujas, produce los creativos, mide las conversiones y optimiza cada semana. Es para negocios que ya gastaron en publicidad sin resultados o prefieren enfocarse en su negocio en vez de aprender a administrar campañas.";

const queIncluye = [
  {
    titulo: "Estructura de campañas",
    desc: "Cómo se organizan campañas, grupos de anuncios y palabras clave o públicos para que cada peso se dirija al servicio correcto.",
    emoji: "🗂️",
  },
  {
    titulo: "Presupuestos y pujas",
    desc: "Cuánto se invierte por campaña y cómo se ajustan las pujas para bajar el costo por contacto sin perder volumen.",
    emoji: "💰",
  },
  {
    titulo: "Creativos",
    desc: "Anuncios de texto, imágenes y video adaptados a cada plataforma: Google, Meta y TikTok no funcionan igual.",
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
    desc: "Un resumen claro de inversión, contactos y costo por contacto — sin jerga que solo entiende quien vive en la plataforma.",
    emoji: "📊",
  },
];

const paraQuienEs = [
  "Ya gastaste en Google Ads, Meta Ads o TikTok Ads y no viste resultados claros.",
  "No sabes qué es un ROAS, un CPC o un CPL, y las plataformas publicitarias no ayudan a entenderlo.",
  "No tienes tiempo de aprender a administrar campañas mientras atiendes tu negocio.",
  "Ya usas (o vas a usar) la plataforma INDEXA y prefieres que alguien más la opere por ti.",
];

const faqMx: { pregunta: string; respuesta: string }[] = [
  {
    pregunta: "¿Cuánto cuesta que INDEXA administre mis campañas de Google, Meta o TikTok Ads?",
    respuesta:
      "Depende de tu inversión publicitaria: no es una tarifa fija. La plataforma INDEXA (herramientas + IA para que tú mismo la operes) cuesta $699 MXN al mes. Que nosotros operemos la cuenta por ti es un servicio aparte que se cotiza según cuánto inviertes en anuncios, partiendo de ahí, y se define en una asesoría inicial.",
  },
  {
    pregunta: "¿Qué es un ROAS y por qué debería importarme?",
    respuesta:
      "ROAS (retorno de inversión publicitaria) es cuánto generas por cada peso que gastas en anuncios. Si no sabes calcularlo o interpretarlo, es una señal de que conviene que alguien más revise tu cuenta: muchas campañas gastan sin que el dueño sepa si están funcionando. Parte de administrar tu cuenta es traducir ese número a algo simple — cuántos contactos llegaron y a qué costo cada uno.",
  },
  {
    pregunta: "Ya gasté en Google Ads y no tuve resultados. ¿Qué hacen distinto?",
    respuesta:
      "Empezamos revisando tu cuenta actual: cómo está medida la conversión, qué palabras clave o públicos reciben el presupuesto, y si los anuncios llevan a una página que realmente convierte. La mayoría de las cuentas que gastan sin resultado tienen mal configurada una de esas tres cosas, no un problema de presupuesto.",
  },
  {
    pregunta: "¿Trabajan con Meta Ads y TikTok Ads, o solo Google?",
    respuesta:
      "Los tres. Qué combinación usar depende de tu industria y tu ciudad: algunos negocios funcionan mejor con búsqueda en Google, porque alguien ya está buscando el servicio; otros con Meta o TikTok, porque ahí se genera la necesidad con contenido. Eso se define en la asesoría inicial, no antes.",
  },
  {
    pregunta: "¿Puedo empezar con la plataforma y después pasar a que ustedes administren?",
    respuesta:
      "Sí. Muchos clientes empiezan con la plataforma ($699 MXN/mes) para probar la IA por su cuenta, y cuando prefieren dedicar menos tiempo a ajustarla piden que INDEXA opere la cuenta. La cotización de la administración se hace sobre tu cuenta e inversión real, nunca sobre una tabla genérica.",
  },
  {
    pregunta: "¿Necesito tener ya una cuenta de Google Ads, Meta Ads o TikTok Ads?",
    respuesta:
      "No es obligatorio. Si ya tienes una cuenta con historial, la conservamos y trabajamos sobre ella. Si no tienes, la creamos como parte del servicio. Lo que sí necesitamos desde el primer día es acceso de administrador y claridad sobre qué cuenta como contacto — WhatsApp, llamada o formulario — para medir bien desde el arranque.",
  },
];

export default function AdministracionDeCampanasPage() {
  const caso = buscarCaso("centro-servicio-electrodomesticos-cdmx");
  const guiasMx = guiasAds.filter((g) => g.mercado === "mx");

  const mesInversion = caso
    ? new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(
        new Date(`${caso.periodo.desde}T00:00:00`)
      )
    : "";

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
        name: "Administración de campañas de Google, Meta y TikTok Ads",
        description:
          "INDEXA opera las campañas de Google, Meta y TikTok Ads de PYMES en México: estructura, presupuesto y pujas, creativos, medición de conversiones, optimización continua y reporte mensual.",
        provider: { "@id": organizationId },
        areaServed: { "@type": "Country", name: "México" },
        audience: {
          "@type": "BusinessAudience",
          audienceType: "PYMES y negocios en México que ya invierten o quieren invertir en publicidad digital",
        },
        offers: [
          planOfferMx,
          {
            "@type": "Offer",
            name: "Administración de campañas (Google, Meta y TikTok Ads)",
            description:
              "INDEXA opera la cuenta de anuncios del cliente día a día. Se cotiza según la inversión publicitaria del cliente, partiendo de ahí, y se define en la asesoría inicial; no tiene precio fijo.",
          },
        ],
        url: pageUrl,
        inLanguage: "es-MX",
      },
      {
        "@type": "FAQPage" as const,
        mainEntity: faqMx.map((f) => ({
          "@type": "Question",
          name: f.pregunta,
          acceptedAnswer: { "@type": "Answer", text: f.respuesta },
        })),
      },
      {
        "@type": "BreadcrumbList" as const,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "INDEXA", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Administración de campañas de Google, Meta y TikTok Ads" },
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
          <div className="absolute top-1/4 right-0 h-[500px] w-[500px] rounded-full bg-indexa-orange/15 blur-[120px]" />

          <div className="relative mx-auto max-w-5xl px-4 pt-28 pb-20 sm:px-6 text-center lg:pt-32">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-white/70 backdrop-blur-sm">
              <span>📣</span>
              Administración de campañas · Google, Meta y TikTok Ads
            </div>

            <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              Administramos tus campañas de{" "}
              <span className="bg-gradient-to-r from-indexa-orange via-orange-400 to-amber-300 bg-clip-text text-transparent">
                Google, Meta y TikTok Ads
              </span>
            </h1>

            <p className="mx-auto mt-7 max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-6 text-left text-lg leading-relaxed text-white/85 backdrop-blur-sm sm:text-xl">
              {RESPUESTA_DIRECTA}
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href={whatsappUrl(
                  "Hola, quiero información sobre la administración de campañas de INDEXA (Google, Meta y TikTok Ads)."
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
            <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">
              ¿Cuánto cuesta que INDEXA administre mis campañas?
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-white/80">
              Aquí conviene ser claros sobre qué pagas y por qué, porque son dos cosas distintas.
            </p>
            <div className="mt-6 rounded-2xl border border-indexa-orange/30 bg-indexa-orange/10 p-6 sm:p-8">
              <p className="text-xl font-bold leading-relaxed text-white sm:text-2xl">
                &ldquo;La plataforma son $699/mes. Que nosotros operemos tus campañas se cotiza según tu inversión,
                partiendo de ahí.&rdquo;
              </p>
            </div>
            <p className="mt-6 text-lg leading-relaxed text-white/80">
              La <strong>plataforma</strong> —$699 MXN al mes— te da las herramientas y la IA para armar y ajustar tus
              propias campañas. <strong>Administrar la cuenta día a día</strong>, en cambio, es un servicio aparte: no
              tiene una tarifa fija porque depende de cuánto inviertes en anuncios. El número exacto se define en una
              asesoría inicial, nunca antes.
            </p>
          </div>
        </section>

        {/* QUÉ INCLUYE */}
        <section id="incluye" className="relative bg-[#050816] py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-wider text-indexa-orange">Qué incluye</p>
              <h2 className="mt-3 text-3xl font-extrabold sm:text-5xl">
                Qué incluye la administración de campañas
              </h2>
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

        {/* PARA QUIÉN ES + DATO PROPIO */}
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

            {caso && (
              <div className="mt-10 rounded-2xl border border-indexa-orange/30 bg-indexa-orange/10 p-6 sm:p-8">
                <p className="text-xs font-bold uppercase tracking-wider text-indexa-orange">
                  Dato propio · cuenta real que administramos
                </p>
                <p className="mt-3 text-lg leading-relaxed text-white/90">
                  Un {caso.industria.toLowerCase()} en {caso.ciudad} que administramos invirtió{" "}
                  {formatoMXN(caso.metricas.inversion)} en {mesInversion} y recibió {caso.metricas.contactos}{" "}
                  contactos por WhatsApp y llamada: {formatoMXN(caso.metricas.costoPorContacto)} por contacto, con{" "}
                  {caso.metricas.tasaContacto.toFixed(0)}% de los clics terminando en un mensaje o llamada.
                </p>
                <ul className="mt-4 space-y-1.5 text-sm text-white/70">
                  {caso.destacados.map((d) => (
                    <li key={d}>• {d}</li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-white/50">
                  Cuenta real administrada por INDEXA, anonimizada: sin nombre ni datos identificables. Contacto ={" "}
                  {caso.definicionConversion.toLowerCase()}. Periodo {caso.periodo.desde} a {caso.periodo.hasta}.
                  Fuente: {caso.fuente}.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* GUÍAS DEL CLUSTER */}
        <section className="relative bg-[#050816] py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <p className="text-sm font-bold uppercase tracking-wider text-indexa-orange">Guías</p>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">Aprende a leer tus propias campañas</h2>
            {guiasMx.length > 0 ? (
              <ul className="mt-8 grid gap-4 sm:grid-cols-2">
                {guiasMx.map((g) => (
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
                Estamos publicando las primeras guías de este cluster — presupuesto, ROAS y cómo leer tu propia
                cuenta. Vuelve pronto.
              </p>
            )}
          </div>
        </section>

        {/* FAQ + CTA FINAL */}
        <section className="relative bg-[#070b1f] py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-wider text-indexa-orange">Preguntas frecuentes</p>
              <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">
                Lo que más nos preguntan sobre administración de campañas
              </h2>
            </div>
            <div className="mt-12 space-y-4">
              {faqMx.map((q) => (
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
              <h3 className="text-2xl font-extrabold sm:text-3xl">¿Listo para que operemos tus campañas?</h3>
              <p className="mx-auto mt-3 max-w-xl text-white/70">
                Cuéntanos tu inversión actual y te decimos, en una llamada, cómo se cotiza que INDEXA administre tu
                cuenta.
              </p>
              <a
                href={whatsappUrl(
                  "Hola, quiero información sobre la administración de campañas de INDEXA (Google, Meta y TikTok Ads)."
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
