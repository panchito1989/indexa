import { buscarCaso, formatoMXN, type CasoAds } from "./casosAds";
import type { GuiaAds } from "./guiasAdsData";

export interface DatoPropioRenderizado {
  /** La plantilla con las cifras del caso ya sustituidas. */
  texto: string;
  /** Procedencia del dato: periodo, definición de contacto y fuente. */
  nota: string;
}

/**
 * Sustituye TODAS las apariciones de cada placeholder (`{contactos}` puede
 * repetirse). Un placeholder desconocido se deja literal: `validarGuia` ya lo
 * rechaza antes de publicar, y dejarlo visible es mejor que inventar un valor.
 */
export function sustituirPlaceholders(plantilla: string, caso: CasoAds): string {
  const m = caso.metricas;
  const valores: Record<string, string> = {
    inversion: formatoMXN(m.inversion),
    contactos: String(m.contactos),
    costoPorContacto: formatoMXN(m.costoPorContacto),
    tasaContacto: `${m.tasaContacto.toFixed(0)}%`,
    industria: caso.industria.toLowerCase(),
    ciudad: caso.ciudad,
  };
  return plantilla.replace(/\{([^}]+)\}/g, (todo, clave: string) => valores[clave] ?? todo);
}

/**
 * El bloque de "dato propio" de una guía. Devuelve `null` si el caso no existe:
 * la página omite el bloque entero en vez de inventar una cifra.
 */
export function renderDatoPropio(guia: GuiaAds): DatoPropioRenderizado | null {
  const caso = buscarCaso(guia.datoPropio.caso);
  if (!caso) return null;

  return {
    texto: sustituirPlaceholders(guia.datoPropio.plantilla, caso),
    nota: `Cuenta real administrada por INDEXA, anonimizada. Periodo ${caso.periodo.desde} a ${caso.periodo.hasta}. Contacto = ${caso.definicionConversion.toLowerCase()}. Fuente: ${caso.fuente}.`,
  };
}
