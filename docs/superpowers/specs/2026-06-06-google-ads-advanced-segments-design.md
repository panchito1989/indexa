# Diseño — Segmentos avanzados de Google Ads (IA + UI) — v1

**Fecha:** 2026-06-06
**Estado:** Aprobado (pendiente de plan de implementación)
**Sub-proyecto A** de la expansión "por-cliente + datos avanzados". (El modelo por-cliente es el sub-proyecto B, aparte.)

## 1. Objetivo

Dar al Asistente IA de Google Ads (y a una nueva pestaña "Segmentos" del admin) acceso a los **datos
segmentados** que hoy le faltan, para diagnóstico y recomendaciones de optimización (especialmente
modificadores de puja). **Solo lectura**: la IA analiza y recomienda; el usuario aplica los cambios.

## 2. Alcance

**Incluye (v1) — 5 segmentos:**
1. **Hora del día** (`segments.hour` + `segments.day_of_week`)
2. **Dispositivo** (`segments.device`: MOBILE/DESKTOP/TABLET/…)
3. **Ubicación** (`geographic_view` por región/ciudad, con nombres resueltos)
4. **Audiencias** (`ad_group_audience_view` / criterios de audiencia)
5. **Extensiones / assets** (sitelinks, callouts, etc. con sus métricas disponibles)

Cada segmento se expone en: (a) `googleAdsClient` (query GAQL), (b) `/api/google-ads` (GET, para la UI),
(c) `/api/google-ads/ai` (tool, para la IA). Además, nueva **pestaña "Segmentos"** en el admin con sub-vistas.

**Fuera de alcance (v1):**
- **Aplicar** modificadores de puja u otras mutaciones (la IA solo recomienda). Mutaciones = v2.
- Modelo por-cliente / `login-customer-id` dinámico (sub-proyecto B).
- Cambios al dashboard cliente (`/dashboard/google-ads`).

## 3. Arquitectura y archivos

| Acción | Archivo | Responsabilidad |
|--------|---------|-----------------|
| ✏️ | `src/lib/googleAdsClient.ts` | 5 funciones de query + tipos + helper de resolución de nombres de ubicación |
| ✏️ | `src/app/api/google-ads/route.ts` | 5 acciones GET nuevas (hourly, device, geo, audiences, extensions) |
| ✏️ | `src/app/api/google-ads/ai/route.ts` | 5 tools nuevas + casos en `executeTool` + system prompt actualizado |
| ✏️ | `src/app/admin/campanas/google-ads/page.tsx` | Pestaña "Segmentos" con sub-vistas (tablas) por segmento |

Reutiliza el helper `gaqlSearch(customerId, accessToken, query)` y el patrón de `getReporting`.

## 4. `googleAdsClient.ts` — funciones de query

Todas reciben `(customerId, accessToken, dateRange)` y devuelven filas tipadas (montos convertidos de micros).

- **`getHourlyPerformance`**
  `SELECT campaign.id, campaign.name, segments.hour, segments.day_of_week, metrics.cost_micros,
  metrics.clicks, metrics.impressions, metrics.conversions, metrics.ctr, metrics.average_cpc
  FROM campaign WHERE segments.date BETWEEN '{start}' AND '{end}' AND campaign.status != 'REMOVED'`
  → tipo `GoogleAdsHourlyRow { hour, dayOfWeek, cost, clicks, impressions, conversions, ctr, avgCpc, campaignId }`.

- **`getDevicePerformance`**
  `SELECT campaign.id, segments.device, metrics.cost_micros, metrics.clicks, metrics.impressions,
  metrics.conversions, metrics.ctr, metrics.average_cpc FROM campaign WHERE segments.date BETWEEN …`
  → `GoogleAdsDeviceRow { device, cost, clicks, impressions, conversions, ctr, avgCpc }`.

- **`getGeoPerformance`** (2 pasos)
  1. `SELECT campaign.id, segments.geo_target_region, segments.geo_target_city, metrics.cost_micros,
     metrics.clicks, metrics.conversions FROM geographic_view WHERE segments.date BETWEEN …`
  2. Resolver nombres de los `geoTargetConstants/{id}` que aparezcan:
     `SELECT geo_target_constant.id, geo_target_constant.name, geo_target_constant.canonical_name
     FROM geo_target_constant WHERE geo_target_constant.resource_name IN (…)`
  → `GoogleAdsGeoRow { locationId, locationName, cost, clicks, conversions, costPerConversion }`.
  (Limitar a top 25 ubicaciones por gasto para acotar la 2ª query de nombres.)

- **`getAudiencePerformance`**
  `SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.display_name,
  ad_group_criterion.type, metrics.cost_micros, metrics.clicks, metrics.conversions
  FROM ad_group_audience_view WHERE segments.date BETWEEN …`
  → `GoogleAdsAudienceRow { name, type, cost, clicks, conversions }`. *(El naming de audiencias puede venir
  como display_name; si la API no lo entrega, se devuelve el criterion_id — degradación elegante.)*

- **`getExtensionPerformance`**
  Assets a nivel campaña con métricas:
  `SELECT asset.id, asset.type, asset.name, metrics.cost_micros, metrics.clicks, metrics.impressions
  FROM campaign_asset WHERE segments.date BETWEEN … AND campaign_asset.status != 'REMOVED'`
  → `GoogleAdsExtensionRow { assetId, type, name, cost, clicks, impressions }`. *(Si la métrica por asset
  no está disponible en esa vista, devolver al menos tipo + nombre de las extensiones activas.)*

> Nota de implementación: hora/dispositivo son las más simples; ubicación requiere el paso de resolución de
> nombres; audiencias y extensiones tienen matices de naming/métricas que el plan resuelve, con degradación
> elegante (devolver lo disponible en vez de fallar).

## 5. `/api/google-ads/route.ts` — acciones GET

Añadir al `switch` del GET (mismo patrón auth + `getValidAccessToken` + `getCustomerId`):
`hourly` → `getHourlyPerformance`, `device` → `getDevicePerformance`, `geo` → `getGeoPerformance`,
`audiences` → `getAudiencePerformance`, `extensions` → `getExtensionPerformance`. Cada una respeta el
rango `dateRange` del query string. Reutiliza el rate limiter y el manejo de error existentes.

## 6. `/api/google-ads/ai/route.ts` — tools de IA

Añadir 5 tools (`input_schema` con `date_range` opcional): `get_hourly_performance`, `get_device_performance`,
`get_geo_performance`, `get_audience_performance`, `get_extension_performance`. Cada caso en `executeTool`
llama a la función correspondiente de `googleAdsClient` y devuelve JSON. **System prompt**: añadir guía para
diagnosticar por segmento y recomendar modificadores de puja (ej. rango -20% a +30% según rendimiento vs
promedio), recordando "⚠️ requiere validación humana; aplícalos tú en Google Ads" (v1 no aplica cambios).

## 7. UI — pestaña "Segmentos" en `admin/campanas/google-ads/page.tsx`

- Nueva tab **"Segmentos"** en el switcher de tabs.
- Dentro, un sub-switcher (Hora · Dispositivo · Ubicación · Audiencias · Extensiones) con carga perezosa
  (fetch al abrir cada sub-vista, vía las acciones GET nuevas), tema claro consistente.
- **Hora:** tabla por hora (0–23, ordenada por hora) con gasto/clics/conv/CPC. Solo tabla en v1 (sin gráfica).
- **Dispositivo:** tabla MOBILE/DESKTOP/TABLET con métricas.
- **Ubicación:** tabla por región/ciudad (nombre resuelto) ordenada por gasto.
- **Audiencias / Extensiones:** tablas con nombre/tipo + métricas disponibles.
- Estados de carga/vacío/error como en las otras tabs. Reutiliza `fmtMoney/fmtNum`.

## 8. Flujo de datos

```
IA:  chat → /api/google-ads/ai → tool get_*_performance → googleAdsClient → GAQL → diagnóstico+recomendación
UI:  Segmentos tab → GET /api/google-ads?action=hourly|device|geo|audiences|extensions → tabla
```

## 9. Errores / seguridad

- Solo lectura — sin mutaciones nuevas. Reutiliza `gaqlSearch` (rate-limit, sanitización de error existentes).
- Degradación elegante en audiencias/extensiones: si la API no entrega un campo/métrica, devolver lo disponible.
- La IA recomienda; nunca aplica (v1). El system prompt lo refuerza.

## 10. Testing / verificación

- Sin infra de tests. Verificación: `next build` (types+lint) + prueba manual:
  - IA: "analiza mi cuenta por hora / por dispositivo / por ubicación" → tablas + recomendaciones.
  - UI: abrir cada sub-vista de "Segmentos" y ver datos de la cuenta conectada.

## 11. Decisiones resueltas

1. 5 segmentos (no 3) — **incluir todo** (hora, dispositivo, ubicación, audiencias, extensiones).
2. IA **y** UI (pestaña "Segmentos").
3. **Solo lectura** (analizar + recomendar); aplicar modificadores = v2.
