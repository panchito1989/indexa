/**
 * Precio público de INDEXA — fuente única.
 *
 * Desde jun-2026 hay UN solo plan ($699 MXN/mes, todo incluido). Los tres
 * planes anteriores ($299 / $599 / $1,299) están retirados; los clientes que
 * ya los tenían conservan su tarifa, y esa lógica vive en el cálculo de
 * ahorro (`api/savings`), no aquí.
 *
 * La administración de campañas hecha por INDEXA es un servicio APARTE que se
 * cotiza según la inversión publicitaria del cliente; no tiene precio fijo y
 * por eso no aparece en este módulo.
 */
export const PLAN_MXN = {
  price: "699",
  currency: "MXN",
} as const;

/** Offer de schema.org para el plan único. Un solo precio, no un rango. */
export const planOfferMx = {
  "@type": "Offer",
  price: PLAN_MXN.price,
  priceCurrency: PLAN_MXN.currency,
  availability: "https://schema.org/InStock",
  priceValidUntil: "2026-12-31",
} as const;
