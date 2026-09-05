/**
 * "2026-09" → "septiembre de 2026". Para la fecha visible "Actualizado: …" de las
 * guías (spec §5.5): el registro guarda "YYYY-MM" para que el schema y el sitemap
 * la lean como fecha, pero una persona no debe leer un código.
 */
export function mesLegible(yyyyMm: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyyMm);
  if (!m) return yyyyMm;
  const fecha = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(fecha);
}
