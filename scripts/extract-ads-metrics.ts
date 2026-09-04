/**
 * Extrae el rendimiento real (últimos 90 días) de las cuentas de Google Ads
 * conectadas a la plataforma, para redactar casos de éxito con cifras reales.
 *
 * SÓLO LEE. No escribe en Firestore ni en Google Ads. Imprime totales por
 * cuenta, desglose mensual y campañas principales; guarda un JSON en la
 * ruta que se pase como primer argumento (fuera del repo).
 *
 * Requiere en el entorno (las mismas que Vercel):
 *   FIREBASE_SERVICE_ACCOUNT (o _KEY)
 *   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET
 *   TOKEN_ENCRYPTION_KEY   (descifra los refresh tokens guardados)
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID (opcional; el contexto por usuario lo resuelve)
 *
 * Ejecución (se empaqueta con esbuild porque importa módulos TS con alias @/):
 *   npx esbuild scripts/extract-ads-metrics.ts --bundle --platform=node \
 *     --format=cjs --packages=external --alias:@=./src \
 *     --outfile=<scratch>/extract-ads-metrics.cjs
 *   npx dotenv -e .env.local -- node <scratch>/extract-ads-metrics.cjs <scratch>/metrics.json
 */
import { writeFileSync } from "node:fs";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  getGoogleAdsContext,
  getReporting,
  type GoogleAdsReportRow,
} from "@/lib/googleAdsClient";

const RANGO = "LAST_90_DAYS";

interface Totales {
  cost: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

function sumar(filas: GoogleAdsReportRow[]): Totales {
  return filas.reduce<Totales>(
    (acc, r) => ({
      cost: acc.cost + r.cost,
      clicks: acc.clicks + r.clicks,
      impressions: acc.impressions + r.impressions,
      conversions: acc.conversions + r.conversions,
    }),
    { cost: 0, clicks: 0, impressions: 0, conversions: 0 }
  );
}

function derivadas(t: Totales) {
  return {
    cpl: t.conversions > 0 ? t.cost / t.conversions : null,
    cpc: t.clicks > 0 ? t.cost / t.clicks : null,
    ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null,
  };
}

const mxn = (n: number | null) => (n === null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(2)}%`);
const mascara = (id: string) => `…${id.slice(-4)}`;

async function main() {
  const salida = process.argv[2];
  const db = getAdminDb();

  const usuarios = await db.collection("usuarios").get();
  const conAds = usuarios.docs.filter(
    (u) => u.get("googleAdsCustomerId") || u.get("googleAdsRefreshToken")
  );
  console.log(`\nUsuarios con Google Ads: ${conAds.length}  (rango ${RANGO})\n`);

  const reporte: unknown[] = [];
  let indice = 0;

  for (const u of conAds) {
    indice++;
    const etiqueta = `Cuenta ${indice}`;

    // Contexto del negocio, si el usuario tiene sitio.
    let negocio: { categoria?: string; ciudad?: string } = {};
    const sitioId = u.get("sitioId");
    if (sitioId) {
      const s = await db.collection("sitios").doc(String(sitioId)).get();
      if (s.exists) negocio = { categoria: s.get("categoria"), ciudad: s.get("ciudad") };
    }

    try {
      const ctx = await getGoogleAdsContext(u.id);
      const filas = await getReporting(
        ctx.customerId,
        { accessToken: ctx.accessToken, loginCustomerId: ctx.loginCustomerId },
        RANGO
      );

      const total = sumar(filas);
      const d = derivadas(total);

      // Desglose mensual: la clave es "YYYY-MM" de la fecha de cada fila.
      const porMes = new Map<string, GoogleAdsReportRow[]>();
      for (const r of filas) {
        const mes = r.date.slice(0, 7);
        porMes.set(mes, [...(porMes.get(mes) ?? []), r]);
      }
      const meses = [...porMes.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, fs]) => {
          const t = sumar(fs);
          return { mes, ...t, ...derivadas(t) };
        });

      // Campañas principales por gasto.
      const porCampana = new Map<string, GoogleAdsReportRow[]>();
      for (const r of filas) {
        porCampana.set(r.campaignName, [...(porCampana.get(r.campaignName) ?? []), r]);
      }
      const campanas = [...porCampana.entries()]
        .map(([nombre, fs]) => {
          const t = sumar(fs);
          return { nombre, ...t, ...derivadas(t) };
        })
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 5);

      console.log(`━━ ${etiqueta}  (customer ${mascara(ctx.customerId)})`);
      console.log(`   Negocio: ${negocio.categoria || "sin categoría"} · ${negocio.ciudad || "sin ciudad"}`);
      console.log(`   Filas (campaña×día): ${filas.length}`);
      console.log(`   90 días → gasto ${mxn(total.cost)} · clics ${total.clicks} · impresiones ${total.impressions} · conversiones ${total.conversions}`);
      console.log(`            CPL ${mxn(d.cpl)} · CPC ${mxn(d.cpc)} · CTR ${pct(d.ctr)}`);
      console.log(`   Por mes:`);
      for (const m of meses) {
        console.log(`     ${m.mes}  gasto ${mxn(m.cost)}  conv ${m.conversions}  CPL ${mxn(m.cpl)}  CPC ${mxn(m.cpc)}  CTR ${pct(m.ctr)}`);
      }
      console.log(`   Campañas principales:`);
      for (const c of campanas) {
        console.log(`     ${mxn(c.cost).padStart(9)}  conv ${String(c.conversions).padStart(3)}  CPL ${mxn(c.cpl).padStart(7)}  ${c.nombre}`);
      }
      console.log("");

      reporte.push({ etiqueta, customer: mascara(ctx.customerId), negocio, total, ...d, meses, campanas });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`━━ ${etiqueta}: no se pudo leer — ${msg}\n`);
      reporte.push({ etiqueta, error: msg });
    }
  }

  if (salida) {
    writeFileSync(salida, JSON.stringify(reporte, null, 2) + "\n", "utf8");
    console.log(`JSON guardado en ${salida}`);
  }
}

main().catch((err) => {
  console.error("Falló la extracción:", err instanceof Error ? err.message : err);
  process.exit(1);
});
