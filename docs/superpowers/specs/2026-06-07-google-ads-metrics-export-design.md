# Diseño — Google Ads: rangos amplios, rendimiento, términos de búsqueda y exportación — v1

**Fecha:** 2026-06-07
**Estado:** Aprobado (pendiente de plan de implementación)

## 1. Objetivo

Cerrar cuatro brechas del módulo de Google Ads, en **ambos** dashboards (cliente
`/dashboard/google-ads` y admin `/admin/campanas/google-ads`):

1. **Rangos de fecha amplios** — hoy el tope efectivo es ~30 días por el dropdown hardcodeado.
2. **Métricas que importan para lead-gen** — rendimiento por campaña, keywords con métricas,
   y términos de búsqueda reales.
3. **Más gráficas** — gasto+conversiones en el tiempo y conversiones/CPA por campaña.
4. **Exportación** — CSV por tabla + Informe PDF con marca (white-label).

**Causa raíz de "solo 30 días":** no es límite de la API de Google Ads (guarda años de histórico).
Es el array `DATE_RANGES` (4 opciones) en ambas páginas + el `switch` de `getDateRange()` en
`googleAdsClient.ts`, que solo contempla `LAST_7_DAYS`, `LAST_30_DAYS`, `THIS_MONTH`, `LAST_MONTH`.

## 2. Decisiones de alcance (confirmadas con el usuario)

- **Dónde:** ambos dashboards (cliente + admin).
- **Exportación:** CSV **y** PDF con marca.
- **Fechas:** presets nuevos **y** rango personalizado (calendario).
- **Organización del código:** **híbrido** — extraer a módulos compartidos la lógica compleja
  y nueva (hook de datos, generadores CSV/PDF, consultas API); el JSX de tablas/gráficas queda
  en cada página pero delgado, respetando los temas oscuro (cliente) / claro (admin).
- **Método PDF:** cliente (jsPDF + jspdf-autotable) — sin costo de servidor ni límites de Vercel.

## 3. Arquitectura y archivos

| Acción | Archivo | Responsabilidad |
|--------|---------|-----------------|
| ✏️ | `src/lib/googleAdsClient.ts` | `getDateRange` con presets nuevos + `CUSTOM`; nuevas `getKeywordPerformance()` y `getSearchTerms()`; firmas que acepten rango custom |
| 🆕 | `src/lib/useGoogleAdsData.ts` | Hook compartido: carga de token, fetch/post API, agregaciones (KPIs, rendimiento por campaña, datos de gráficas), estado del rango (incl. custom). Lo consumen ambas páginas |
| 🆕 | `src/lib/googleAdsExport.ts` | `downloadCSV()` (sin deps) + `generateGoogleAdsPdf()` (jsPDF) con branding |
| ✏️ | `src/app/api/google-ads/route.ts` | Aceptar `startDate`/`endDate` validados + `dateRange=CUSTOM`; acciones GET `keyword_performance` y `search_terms` |
| ✏️ | `src/app/dashboard/google-ads/page.tsx` | Consumir el hook; selector de fechas con custom; columnas de rendimiento; gráficas; tab Términos; botones export |
| ✏️ | `src/app/admin/campanas/google-ads/page.tsx` | Igual que cliente (tema claro); Términos como vista nueva |
| ✏️ | `package.json` | Añadir `jspdf` + `jspdf-autotable` |

Reutiliza el helper `gaqlSearch(customerId, accessToken, query)`, el patrón de `getReporting`/segmentos,
y `useBranding()` para la marca del PDF.

## 4. `googleAdsClient.ts` — cambios

### 4.1 Rangos de fecha
`getDateRange(range, custom?)` añade:
- `LAST_90_DAYS` → `{ sub(90), sub(1) }`
- `LAST_12_MONTHS` → `{ sub(365), sub(1) }`
- `THIS_YEAR` → `{ 1-ene del año actual, sub(1) }`
- `CUSTOM` → usa `custom.startDate`/`custom.endDate` (ya validadas en la API).

Las funciones que reciben `dateRange: string` añaden un 4º parámetro **opcional**
`custom?: { startDate: string; endDate: string }` (firma `(customerId, accessToken, range, custom?)`).
`getDateRange(range, custom?)` devuelve `custom` cuando `range === "CUSTOM"`. Esta es la forma menos
invasiva: los callers existentes no pasan `custom` y siguen funcionando igual. Aplica a `getReporting`,
`getHourly/Device/Geo/Audience/ExtensionPerformance` y las dos funciones nuevas.

### 4.2 `getKeywordPerformance(customerId, accessToken, range, custom?)`
```
SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
       ad_group_criterion.keyword.match_type, ad_group.id, campaign.id, campaign.name,
       metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.ctr,
       metrics.average_cpc, metrics.conversions, metrics.cost_per_conversion
FROM keyword_view
WHERE segments.date BETWEEN '{start}' AND '{end}'
  AND ad_group_criterion.status != 'REMOVED'
ORDER BY metrics.cost_micros DESC
LIMIT 500
```
→ `GoogleAdsKeywordPerfRow { keywordId, text, matchType, campaignId, campaignName, cost, clicks,
impressions, ctr, avgCpc, conversions, costPerConversion }`. El **Quality Score** se mantiene desde
`getKeywords()` (atributo actual, sin segmentar por fecha) y se hace merge por `keywordId` en el front
para evitar el matiz de QS+segments.date.

### 4.3 `getSearchTerms(customerId, accessToken, range, custom?)`
```
SELECT search_term_view.search_term, search_term_view.status, campaign.name,
       metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.ctr,
       metrics.conversions, metrics.cost_per_conversion
FROM search_term_view
WHERE segments.date BETWEEN '{start}' AND '{end}'
ORDER BY metrics.cost_micros DESC
LIMIT 200
```
→ `GoogleAdsSearchTermRow { term, status, campaignName, cost, clicks, impressions, ctr,
conversions, costPerConversion }`. `.catch(() => [])` como los segmentos (cuentas sin datos no rompen).
Top 200 por costo; el front avisa si se alcanzó el límite.

## 5. `/api/google-ads/route.ts` — cambios

- **Rango custom:** leer `startDate`/`endDate` del query string. Validar con
  `^\d{4}-\d{2}-\d{2}$`, `start <= end`, y `end <= hoy` (formato ISO). Si inválido → 400 con mensaje claro.
  Construir el objeto `custom` y pasarlo a las funciones del cliente cuando `dateRange === "CUSTOM"`.
- **Acciones GET nuevas:** `keyword_performance` → `getKeywordPerformance`,
  `search_terms` → `getSearchTerms`. Mismo patrón auth + rate limit + `getValidAccessToken` +
  `getCustomerId` + manejo de error (502) existente.

## 6. Hook compartido — `src/lib/useGoogleAdsData.ts`

Encapsula y devuelve:
- **Estado:** `customerId`, `accountInfo`, `campaigns`, `reportRows`, `keywords`, `keywordPerf`,
  `searchTerms`, `segRows`, `loading`, `error`, `dateRange`, `customStart`, `customEnd`.
- **Acciones:** `setDateRange`, `setCustomRange`, `loadData`, `loadKeywords`, `loadKeywordPerf`,
  `loadSearchTerms`, `loadSegment`, `apiPost` (para pausar/activar/presupuesto), `reload`.
- **Derivados (memo):** `totals` (gasto, clics, impr., conv., CTR, CPC), `campaignPerf`
  (mapa por `campaignId` agregado desde `reportRows` — **sin llamada extra**), `chartData`
  (por fecha: cost + conversions), `currency`.

Ambas páginas pasan a ser "thin": consumen el hook y solo renderizan JSX con su tema.
Esto elimina la duplicación de lógica que hoy existe entre las dos páginas.

## 7. Exportación — `src/lib/googleAdsExport.ts`

### 7.1 CSV (sin dependencias)
`downloadCSV(filename, headers, rows)`: arma CSV (escape de comillas/comas/saltos), crea `Blob`
+ enlace temporal y dispara la descarga. Cada tabla (campañas, keywords, términos, segmentos)
exporta sus columnas visibles. Botón deshabilitado si no hay filas.

### 7.2 PDF con marca (jsPDF + jspdf-autotable)
`generateGoogleAdsPdf({ branding, brandName, isWhiteLabel, accountInfo, periodLabel, totals,
campaignPerf, keywordPerf, searchTerms })`:
- **Header:** logo (si `branding.logoUrl`; se carga a dataURL — si falla, se omite sin romper),
  nombre de marca, "Informe de Google Ads", cuenta y periodo. Color de acento = `branding.colorPrincipal`.
- **Resumen KPIs:** gasto, clics, impresiones, CTR, CPC, conversiones, CPA.
- **Tablas (autotable):** rendimiento por campaña; top 20 keywords por costo; top 20 términos por costo.
- **Gráfica:** barras de gasto por fecha dibujadas nativas en jsPDF (no se captura el SVG de recharts → sin deps extra).
- **Pie:** fecha de generación + nombre de marca.
- Branding: en cliente usa `useBranding()` (white-label si aplica); en admin, marca Indexa.

## 8. UI — cambios por pestaña (ambas páginas, tema según la página)

- **Selector de fechas:** dropdown con presets nuevos + opción "Personalizado" que muestra dos
  `<input type="date">`. Validación cliente: `start <= end` y `end <= ayer`. Al confirmar, dispara recarga.
- **Resumen:** (a) gráfica existente ampliada a **Gasto + Conversiones** (doble eje Y, recharts
  `LineChart` con segunda `YAxis`); (b) nueva **barra Conversiones/CPA por campaña** (top por costo);
  (c) botones **Exportar CSV** e **Informe PDF**.
- **Campañas:** columnas nuevas Clics, Impr., CTR, Conv., **CPA** (desde `campaignPerf`, derivado de
  `reportRows`). Se mantienen presupuesto/estado/acciones (y edición de presupuesto en admin). Export CSV.
- **Palabras clave:** columnas nuevas Costo, Clics, CTR, Conv., **CPA** (desde `keywordPerf`, merge de
  QS por `keywordId`). Se mantiene Quality Score/concordancia/estado. Export CSV.
- **Términos de búsqueda:** tabla nueva (término, campaña, costo, clics, impr., CTR, conv., CPA),
  ordenada por costo. En **cliente** = tab nuevo ("Términos") en el switcher de tabs. En **admin** =
  6ª sub-vista dentro de la pestaña "Segmentos" (reutiliza el sub-switcher y el `SEG_ACTION` existentes,
  añadiendo `terminos → search_terms`). Aviso si se truncó a 200. Export CSV.

## 9. Métricas y defaults (ajustables)

- **CPA** = costo / conversiones; **tasa conv.** = conversiones / clics. Mostrar "—" si conversiones = 0.
- Fin del rango limitado a **ayer** (datos de hoy incompletos; coincide con `sub(1)` actual).
- Términos: **top 200** por costo. Keywords-perf: top 500 por costo.
- Formato de moneda/número: reutiliza `fmtMoney`/`fmtNum` y la `currency` de la cuenta.

## 10. Errores / seguridad

- **Validación de fechas** en la API (400 si inválido); end ≤ hoy para no permitir rangos futuros.
- GAQL nuevo con **degradación elegante** (`.catch(() => [])`) en términos de búsqueda (cuentas sin datos).
- Reutiliza rate limiter, auth (`verifyIdToken`), sanitización de error y conversión de micros existentes.
- PDF: carga de logo con try/catch → genera sin logo si falla. Export deshabilitado sin datos.
- Sin cambios al modelo de permisos/paywall: el cliente mantiene `PaywallOverlay`/`requireActive`.

## 11. Dependencias nuevas

`jspdf` y `jspdf-autotable` (cliente). CSV: ninguna. Gráficas: `recharts` ya presente (^3.8.1).

## 12. Testing / verificación

- Sin infraestructura de tests en el repo. Verificación: `npm run build` (types + lint) + prueba manual:
  - Cambiar a 90 días / 12 meses / rango personalizado → la gráfica y KPIs reflejan el rango.
  - Campañas y Keywords muestran columnas de rendimiento con CPA correcto.
  - Términos de búsqueda carga datos de la cuenta conectada.
  - Exportar CSV de cada tabla abre un archivo correcto.
  - Informe PDF se descarga con la marca correcta (Indexa por defecto; agencia si white-label).

## 13. Fuera de alcance (YAGNI)

- Envío automático del PDF por correo (futuro, con Resend).
- Captura de las gráficas de recharts dentro del PDF (se usan barras nativas simples).
- Refactor visual a componentes UI compartidos (se eligió híbrido: solo lógica compartida).
- Métricas a nivel de anuncio (la tab Anuncios queda igual).
- Cambios al Asistente IA (ya tiene sus tools de segmentos).

## 14. Decisiones resueltas

1. Ambos dashboards (cliente + admin).
2. CSV **y** PDF con marca (white-label vía `useBranding()`).
3. Presets nuevos **y** rango personalizado con calendario.
4. Híbrido: lógica compartida (hook + export + API), JSX por página.
5. PDF en el navegador (jsPDF), no servidor.
6. Rendimiento por campaña derivado de `reporting` (sin llamada API extra); keywords y términos sí
   requieren GAQL nuevo.
