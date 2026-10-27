import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { casos, formatoMXN, type CasoAds, type CasoMetricas } from "@/lib/casosAds";
import { whatsappUrl } from "@/lib/contact";
import { mesLegible } from "@/lib/fechas";
import { jsonLdHtml } from "@/lib/jsonLd";

const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://indexaia.com";
const SITE_URL = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
const PAGE_URL = `${SITE_URL}/casos-de-exito`;

/*
 * Antes esta página tenía tres "casos" con nombres, ciudades y resultados
 * inventados ("15+ mensajes", "3x cotizaciones"). Hoy sólo publica lo que hay
 * en `casos-ads.json`: casos anónimos con cifras de la exportación de la
 * cuenta, periodo, fuente y la definición exacta de lo que se mide. Si el
 * registro crece, la página crece sola.
 */

export const metadata: Metadata = {
  // Sin marca: el layout aplica la plantilla "%s | INDEXA".
  title: "Casos reales: cifras de cuentas de Google Ads que administramos",
  description:
    "Resultados reales de cuentas publicitarias administradas por INDEXA: inversión, contactos por WhatsApp y llamada, costo por contacto y cuota de impresiones. Casos anónimos con periodo y fuente.",
  alternates: { canonical: "/casos-de-exito" },
  openGraph: {
    title: "Casos reales — INDEXA",
    description:
      "Cifras reales de cuentas de Google Ads administradas por INDEXA, publicadas con periodo, fuente y definición de contacto.",
    url: PAGE_URL,
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

function periodoLegible(c: CasoAds): string {
  const desde = mesLegible(c.periodo.desde.slice(0, 7));
  const hasta = mesLegible(c.periodo.hasta.slice(0, 7));
  return desde === hasta ? desde : `${desde} a ${hasta}`;
}

function filasComparacion(actual: CasoMetricas, previo: CasoMetricas) {
  return [
    { k: "Inversión", a: formatoMXN(previo.inversion), b: formatoMXN(actual.inversion) },
    { k: "Clics", a: String(previo.clics), b: String(actual.clics) },
    { k: "Contactos", a: String(previo.contactos), b: String(actual.contactos) },
    { k: "Costo por contacto", a: formatoMXN(previo.costoPorContacto), b: formatoMXN(actual.costoPorContacto) },
    { k: "Clics que contactan", a: `${previo.tasaContacto.toFixed(1)}%`, b: `${actual.tasaContacto.toFixed(1)}%` },
  ];
}

export default function CasosDeExito() {
  const lista = casos();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": PAGE_URL,
    url: PAGE_URL,
    name: "Casos reales — INDEXA",
    description: metadata.description,
    inLanguage: "es-MX",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: { "@id": `${SITE_URL}/#organization` },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: lista.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `${c.industria} en ${c.ciudad}`,
        description: `${c.metricas.contactos} contactos (${c.definicionConversion.toLowerCase()}) con ${formatoMXN(c.metricas.inversion)} invertidos en ${periodoLegible(c)}; ${formatoMXN(c.metricas.costoPorContacto)} por contacto. Fuente: ${c.fuente}.`,
      })),
    },
  };

  return (
    <>
      <Header />
      <main className="bg-white">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />

        {/* Hero */}
        <section className="relative overflow-hidden bg-[#050816] pt-32 pb-20">
          <div className="absolute top-1/3 left-1/4 h-[400px] w-[400px] rounded-full bg-indexa-blue/20 blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 h-[300px] w-[300px] rounded-full bg-indexa-orange/15 blur-[100px]" />
          <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
            <span className="inline-block rounded-full bg-indexa-orange/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-indexa-orange">
              Casos reales
            </span>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Cifras reales de cuentas{" "}
              <span className="bg-gradient-to-r from-indexa-orange to-amber-300 bg-clip-text text-transparent">
                que administramos
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-white/60">
              Sin testimonios inventados ni promedios. Cada caso sale de la exportación de la
              cuenta publicitaria, con su periodo, su fuente y la definición exacta de lo que
              medimos. Los nombres se omiten a petición de los clientes.
            </p>
          </div>
        </section>

        {/* Casos */}
        <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
          <div className="space-y-16">
            {lista.map((c) => {
              const m = c.metricas;
              const periodo = periodoLegible(c);
              const metricas = [
                { valor: String(m.contactos), etiqueta: "contactos en el periodo" },
                { valor: formatoMXN(m.costoPorContacto), etiqueta: "por contacto" },
                { valor: formatoMXN(m.inversion), etiqueta: "invertidos" },
                { valor: `${m.tasaContacto.toFixed(0)}%`, etiqueta: "de los clics contactan" },
                ...(m.cuotaImpresiones !== undefined
                  ? [{ valor: `${m.cuotaImpresiones}%`, etiqueta: "cuota de impresiones" }]
                  : []),
              ];
              return (
                <article
                  key={c.slug}
                  id={c.slug}
                  className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm sm:p-10"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-extrabold text-indexa-gray-dark">
                      {c.industria}
                    </h2>
                    <span className="rounded-full bg-indexa-orange/10 px-3 py-1 text-xs font-bold text-indexa-orange">
                      {c.ciudad}
                    </span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                      Cuenta administrada desde {c.relacionDesde}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-gray-500">
                    {c.mercado === "mx" ? "Google Ads · México" : "Google Ads · USA"} · Cifras de {periodo}
                  </p>

                  <dl className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
                    {metricas.map((x) => (
                      <div key={x.etiqueta} className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
                        <dd className="text-2xl font-extrabold text-indexa-gray-dark">{x.valor}</dd>
                        <dt className="mt-1 text-xs font-medium text-gray-500">{x.etiqueta}</dt>
                      </div>
                    ))}
                  </dl>

                  {c.comparacion && c.metricasComparacion && (
                    <div className="mt-8">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-indexa-blue">
                        Arranque de la cuenta vs. primer mes completo
                      </h3>
                      <p className="mt-2 text-sm text-gray-600">
                        El primer periodo cubre sólo {c.comparacion.desde} a {c.comparacion.hasta},
                        los primeros días de la cuenta, así que no es un &quot;antes y después&quot;:
                        es el arranque frente al primer mes completo ({c.periodo.desde} a {c.periodo.hasta}).
                      </p>
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                              <th className="py-2 pr-4 font-semibold">Métrica</th>
                              <th className="py-2 pr-4 font-semibold">Arranque</th>
                              <th className="py-2 font-semibold">Mes completo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filasComparacion(m, c.metricasComparacion).map((f) => (
                              <tr key={f.k} className="border-b border-gray-100">
                                <td className="py-2 pr-4 font-medium text-indexa-gray-dark">{f.k}</td>
                                <td className="py-2 pr-4 text-gray-600">{f.a}</td>
                                <td className="py-2 font-semibold text-indexa-gray-dark">{f.b}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {c.destacados.length > 0 && (
                    <div className="mt-8">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-green-600">
                        Lo que se observa en la cuenta
                      </h3>
                      <ul className="mt-3 space-y-2">
                        {c.destacados.map((d) => (
                          <li key={d} className="flex items-start gap-2 text-sm text-gray-700">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-gray-500">
                    <span className="font-semibold text-gray-700">Cómo se mide:</span> un contacto es{" "}
                    {c.definicionConversion.toLowerCase()}; no es una venta cerrada. Periodo {c.periodo.desde} a{" "}
                    {c.periodo.hasta}. Fuente: {c.fuente}. Caso publicado sin nombre ni identificadores a petición del cliente.
                  </p>
                </article>
              );
            })}
          </div>

          {/* Cómo leer estas cifras */}
          <div className="mt-20 rounded-2xl border border-indexa-orange/20 bg-indexa-orange/5 p-8 sm:p-10">
            <h2 className="text-2xl font-extrabold text-indexa-gray-dark">Cómo leer estas cifras</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-gray-700 sm:text-base">
              <li>
                <span className="font-semibold">Contacto no es cliente.</span> Contamos clics al botón de WhatsApp y
                llamadas desde el anuncio, que es lo que la cuenta registra. Cuántos se convierten en venta depende
                de cómo atienda cada negocio.
              </li>
              <li>
                <span className="font-semibold">Un mes no es una tendencia.</span> Publicamos periodos completos y
                la fuente exacta; los resultados de otro giro, otra ciudad u otro presupuesto serán distintos.
              </li>
              <li>
                <span className="font-semibold">No hay precio fijo para administrar campañas.</span> La plataforma
                cuesta $699 MXN/mes; que nosotros operemos tus campañas se cotiza según tu inversión publicitaria.
              </li>
            </ul>
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <h2 className="text-2xl font-extrabold text-indexa-gray-dark">
              ¿Quieres saber qué cifras son razonables para tu negocio?
            </h2>
            <p className="mt-3 text-gray-500">
              Te decimos con qué presupuesto tiene sentido empezar y qué costo por contacto es realista en tu giro.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={whatsappUrl("Hola, vi los casos reales en indexaia.com y quiero una cotización para que administren mis campañas")}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indexa-orange to-orange-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-indexa-orange/25 transition-all hover:shadow-xl hover:-translate-y-0.5"
              >
                Cotizar por WhatsApp
              </a>
              <Link
                href="/administracion-de-campanas"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-8 py-4 text-base font-bold text-indexa-gray-dark transition-all hover:border-indexa-orange/40"
              >
                Cómo administramos campañas
              </Link>
            </div>
          </div>
        </section>

        {/* Internal links */}
        <section className="border-t border-gray-100 bg-gray-50 py-16">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
            <h3 className="text-lg font-bold text-indexa-gray-dark">
              Guías con estos mismos datos
            </h3>
            <div className="mt-6 flex flex-wrap justify-center gap-4">
              <Link
                href="/guia/cuanto-gastar-en-google-ads-negocio-local"
                className="rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-indexa-gray-dark shadow-sm hover:shadow-md transition-all"
              >
                Cuánto gastar en Google Ads
              </Link>
              <Link
                href="/guia/que-es-roas-cpl-cpc-explicado-simple"
                className="rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-indexa-gray-dark shadow-sm hover:shadow-md transition-all"
              >
                ROAS, CPL y CPC explicados
              </Link>
              <Link
                href="/guia/administrar-google-ads-yo-mismo-o-contratar"
                className="rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-indexa-gray-dark shadow-sm hover:shadow-md transition-all"
              >
                ¿Administrar yo mismo o contratar?
              </Link>
              <Link
                href="/pagina-web-cdmx"
                className="rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-indexa-gray-dark shadow-sm hover:shadow-md transition-all"
              >
                Página web para negocios en CDMX
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
