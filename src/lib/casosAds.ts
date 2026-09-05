import datos from "@/data/casos-ads.json";

export interface CasoMetricas {
  /** MXN, sin decimales. */
  inversion: number;
  /** Clics a WhatsApp + llamadas. NUNCA "clientes" ni "ventas". */
  contactos: number;
  /** inversion / contactos, redondeado. El test exige consistencia. */
  costoPorContacto: number;
  clics: number;
  /** contactos / clics × 100. */
  tasaContacto: number;
  /** Porcentaje de cuota de impresiones, si la exportación lo trae. */
  cuotaImpresiones?: number;
}

export interface CasoAds {
  slug: string;
  mercado: "mx" | "usa";
  industria: string;
  ciudad: string;
  /** Siempre true: se publica sin nombre ni identificadores. */
  anonimo: true;
  relacionDesde: string;
  fuente: string;
  definicionConversion: string;
  periodo: { desde: string; hasta: string };
  comparacion?: { desde: string; hasta: string };
  metricas: CasoMetricas;
  metricasComparacion?: CasoMetricas;
  destacados: string[];
}

const archivo = datos as { casos: CasoAds[] };

export function casos(): CasoAds[] {
  return archivo.casos;
}

export function buscarCaso(slug: string): CasoAds | null {
  return archivo.casos.find((c) => c.slug === slug) ?? null;
}

/** "$159 MXN" — sin decimales, con separador de miles. */
export function formatoMXN(monto: number): string {
  return `$${Math.round(monto).toLocaleString("en-US")} MXN`;
}
