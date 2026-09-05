import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { buscarCaso, formatoMXN } from "@/lib/casosAds";
import { buscarGuia, guiasAds } from "@/lib/guiasAdsData";
import { buildGuiaGraph } from "@/lib/guiaSchemas";

const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://indexaia.com";
const SITE_URL = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return guiasAds.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guia = buscarGuia(slug);
  if (!guia) return {};

  return {
    title: guia.seoTitle,
    description: guia.seoDescription,
    alternates: { canonical: `/guia/${guia.slug}` },
    openGraph: {
      type: "article",
      title: guia.seoTitle,
      description: guia.seoDescription,
      url: `${SITE_URL}/guia/${guia.slug}`,
      locale: guia.mercado === "usa" ? "es_US" : "es_MX",
    },
  };
}

/** Sustituye los placeholders con las cifras del caso. Sin caso, no hay bloque. */
function renderDatoPropio(guia: NonNullable<ReturnType<typeof buscarGuia>>): { texto: string; nota: string } | null {
  const caso = buscarCaso(guia.datoPropio.caso);
  if (!caso) return null; // nunca se inventa una cifra

  const m = caso.metricas;
  const texto = guia.datoPropio.plantilla
    .replace("{inversion}", formatoMXN(m.inversion))
    .replace("{contactos}", String(m.contactos))
    .replace("{costoPorContacto}", formatoMXN(m.costoPorContacto))
    .replace("{tasaContacto}", `${m.tasaContacto.toFixed(0)}%`)
    .replace("{industria}", caso.industria.toLowerCase())
    .replace("{ciudad}", caso.ciudad);

  const nota = `Cuenta real administrada por INDEXA, anonimizada. Periodo ${caso.periodo.desde} a ${caso.periodo.hasta}. Contacto = ${caso.definicionConversion.toLowerCase()}. Fuente: ${caso.fuente}.`;
  return { texto, nota };
}

export default async function GuiaAdsPage({ params }: PageProps) {
  const { slug } = await params;
  const guia = buscarGuia(slug);
  if (!guia) notFound();

  const dato = renderDatoPropio(guia);
  const hub = guia.mercado === "usa"
    ? "/administracion-de-campanas-usa"
    : "/administracion-de-campanas";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildGuiaGraph(guia, SITE_URL)) }}
      />
      <Header />

      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <nav className="mb-6 text-sm text-gray-500">
          <Link href="/guia" className="hover:text-indexa-orange">Guías</Link>
          <span className="mx-2">/</span>
          <span>{guia.h1}</span>
        </nav>

        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{guia.h1}</h1>

        <p className="mt-3 text-sm text-gray-500">
          Actualizado: {guia.actualizado}
        </p>

        {/* Respuesta directa — el bloque que un modelo debe poder citar solo. */}
        <p className="mt-6 rounded-xl bg-gray-50 p-5 text-lg leading-relaxed text-gray-800">
          {guia.respuestaDirecta}
        </p>

        {dato && (
          <aside className="mt-6 rounded-xl border-l-4 border-indexa-orange bg-orange-50/60 p-5">
            <p className="text-gray-800">{dato.texto}</p>
            <p className="mt-2 text-xs text-gray-500">{dato.nota}</p>
          </aside>
        )}

        {guia.secciones.map((seccion) => (
          <section key={seccion.titulo} className="mt-10">
            <h2 className="text-2xl font-semibold text-gray-900">{seccion.titulo}</h2>
            {seccion.parrafos.map((p, i) => (
              <p key={i} className="mt-4 leading-relaxed text-gray-700">{p}</p>
            ))}
            {seccion.pasos && (
              <ol className="mt-4 list-decimal space-y-2 pl-6 text-gray-700">
                {seccion.pasos.map((paso, i) => <li key={i}>{paso}</li>)}
              </ol>
            )}
            {seccion.tabla && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {seccion.tabla.encabezados.map((h) => (
                        <th key={h} className="border-b p-2 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {seccion.tabla.filas.map((fila, i) => (
                      <tr key={i}>
                        {fila.map((celda, j) => (
                          <td key={j} className="border-b p-2">{celda}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-gray-900">Preguntas frecuentes</h2>
          <dl className="mt-4 space-y-6">
            {guia.faq.map((f) => (
              <div key={f.pregunta}>
                <dt className="font-semibold text-gray-900">{f.pregunta}</dt>
                <dd className="mt-1 text-gray-700">{f.respuesta}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-12 rounded-2xl bg-[#050816] p-8 text-white">
          <h2 className="text-2xl font-semibold">¿Prefieres que lo hagamos nosotros?</h2>
          <p className="mt-3 text-gray-300">
            La plataforma INDEXA son $699 MXN/mes y te da las herramientas para
            hacerlo tú con IA. Que nosotros operemos tus campañas día a día se
            cotiza según tu inversión, partiendo de ahí.
          </p>
          <Link
            href={hub}
            className="mt-5 inline-block rounded-xl bg-indexa-orange px-6 py-3 font-semibold"
          >
            Ver cómo funciona la administración
          </Link>
          {guia.casoExito && (
            <p className="mt-4 text-sm text-gray-400">
              <Link href={`/casos-de-exito#${guia.casoExito}`} className="underline">
                Ver el caso de un negocio de esta industria
              </Link>
            </p>
          )}
        </section>

        {guia.hermanas.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-semibold text-gray-900">Sigue leyendo</h2>
            <ul className="mt-3 space-y-2">
              {guia.hermanas.map((slugHermana) => {
                const hermana = buscarGuia(slugHermana);
                if (!hermana) return null;
                return (
                  <li key={slugHermana}>
                    <Link href={`/guia/${slugHermana}`} className="text-indexa-orange hover:underline">
                      {hermana.h1}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </article>

      <Footer />
    </>
  );
}
