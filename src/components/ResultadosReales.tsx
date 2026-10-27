import Link from "next/link";
import { buscarCaso, CASO_DESTACADO, formatoMXN } from "@/lib/casosAds";
import { mesLegible } from "@/lib/fechas";

interface Props {
  /** "oscuro" para fondos #050816 (home); "claro" para páginas en blanco (CDMX). */
  tema?: "oscuro" | "claro";
  /** Encabezado alternativo, p. ej. para contextualizar la ciudad. */
  titulo?: string;
}

/**
 * Bloque de prueba social con datos reales: sustituye a las reseñas y a las
 * cifras sin fuente ("+340%", "4.9 de 5") que había en la home.
 *
 * Todo sale del registro `casos-ads.json`: un caso anónimo con cifras de una
 * exportación de Google Ads, publicado con fecha, periodo y definición de
 * "contacto". Nunca se escriben números a mano aquí. Las reglas del caso:
 * anónimo, "contactos" (nunca "clientes" ni "ventas") y sin causas no
 * confirmadas.
 */
export default function ResultadosReales({ tema = "oscuro", titulo }: Props) {
  const caso = buscarCaso(CASO_DESTACADO);
  if (!caso) return null;

  const m = caso.metricas;
  const periodo = mesLegible(caso.periodo.desde.slice(0, 7));
  const oscuro = tema === "oscuro";

  const metricas = [
    {
      valor: String(m.contactos),
      etiqueta: "contactos en un mes",
      nota: "clics a WhatsApp y llamadas desde el anuncio",
    },
    {
      valor: formatoMXN(m.costoPorContacto),
      etiqueta: "por contacto",
      nota: `${formatoMXN(m.inversion)} invertidos en ${periodo}`,
    },
    {
      valor: `${m.tasaContacto.toFixed(0)}%`,
      etiqueta: "de los clics contactan",
      nota: `${m.contactos} contactos de ${m.clics} clics`,
    },
  ];
  if (m.cuotaImpresiones !== undefined) {
    metricas.push({
      valor: `${m.cuotaImpresiones}%`,
      etiqueta: "cuota de impresiones",
      nota: "presencia en la subasta de Google",
    });
  }

  const texto = oscuro ? "text-white" : "text-indexa-gray-dark";
  const textoSuave = oscuro ? "text-white/55" : "text-gray-600";
  const tarjeta = oscuro
    ? "border-white/10 bg-white/5 backdrop-blur-sm"
    : "border-gray-200 bg-white shadow-sm";

  return (
    <section
      id="resultados"
      aria-labelledby="resultados-titulo"
      className={
        oscuro
          ? "relative overflow-hidden bg-[#050816] py-24 sm:py-32"
          : "bg-gray-50 py-20"
      }
    >
      {oscuro && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indexa-orange/5 blur-[150px]" />
      )}

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="inline-block rounded-full bg-indexa-orange/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-indexa-orange">
            Datos reales · {periodo}
          </span>
          <h2
            id="resultados-titulo"
            className={`mt-4 text-3xl font-extrabold sm:text-5xl ${texto}`}
          >
            {titulo ?? (
              <>
                Resultados reales,{" "}
                <span className="bg-gradient-to-r from-indexa-orange to-amber-400 bg-clip-text text-transparent">
                  no promesas
                </span>
              </>
            )}
          </h2>
          <p className={`mx-auto mt-5 max-w-3xl text-base sm:text-lg ${textoSuave}`}>
            {caso.industria} en {caso.ciudad}, con una cuenta de Google Ads que INDEXA
            administra desde {caso.relacionDesde}. Son las cifras de {periodo} tal como
            salen de la cuenta. El caso se publica sin nombre a petición del cliente.
          </p>
        </div>

        <dl className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metricas.map((x) => (
            <div key={x.etiqueta} className={`rounded-2xl border p-6 text-center ${tarjeta}`}>
              <dd className="bg-gradient-to-r from-indexa-orange to-amber-300 bg-clip-text text-4xl font-extrabold text-transparent sm:text-5xl">
                {x.valor}
              </dd>
              <dt className={`mt-2 text-sm font-semibold ${texto}`}>{x.etiqueta}</dt>
              <p className={`mt-1 text-xs ${oscuro ? "text-white/40" : "text-gray-500"}`}>{x.nota}</p>
            </div>
          ))}
        </dl>

        <p className={`mx-auto mt-8 max-w-3xl text-center text-xs sm:text-sm ${oscuro ? "text-white/40" : "text-gray-500"}`}>
          Un contacto es {caso.definicionConversion.toLowerCase()}; no es una venta
          cerrada. Periodo {caso.periodo.desde} a {caso.periodo.hasta}. Fuente: {caso.fuente}.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-6">
          <Link
            href="/administracion-de-campanas"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indexa-orange to-orange-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indexa-orange/25 transition-all hover:-translate-y-0.5"
          >
            Así administramos campañas →
          </Link>
          <Link
            href="/casos-de-exito"
            className={`text-sm font-semibold underline decoration-indexa-orange/40 underline-offset-4 transition-colors hover:text-indexa-orange ${textoSuave}`}
          >
            Ver el caso completo
          </Link>
        </div>
      </div>
    </section>
  );
}
