# Diseño — Google Ads: aplicar bid modifiers (Fase 1.5)

**Fecha:** 2026-06-06
**Estado:** Aprobado (pendiente de spec-review + plan)
**Sigue a:** Fase 1 (gestor conversacional). En Fase 1 la IA **recomienda** modificadores de puja; aquí los **aplica** (device/horario/ubicación), con confirmación y rieles de seguridad. Dinero real → conservador.

## 1. Objetivo

Que la IA, tras confirmación explícita, **aplique** modificadores de puja por **dispositivo**, **horario
(ad schedule)** y **ubicación**, partiendo del diagnóstico que ya hace con los segmentos de Fase 1.

## 2. Alcance

**Incluye:** 3 setters de bid modifier + 3 tools de IA + 3 POST actions. Rieles: clamp del valor, confirmación
obligatoria, degradación elegante, verificación en vivo.
**Fuera:** modificadores de audiencia (Fase 1.6 si se quiere); cualquier UI nueva (la IA aplica; los datos ya se
ven en la pestaña "Segmentos"); Meta/TikTok (Fases 2-3); modelo por-cliente (Fase 4).

## 3. Arquitectura y archivos

| Acción | Archivo | Responsabilidad |
|--------|---------|-----------------|
| ✏️ | `src/lib/googleAdsClient.ts` | `clampBidModifier` + `setDeviceBidModifier` + `setAdScheduleBidModifier` + `setLocationBidModifier` |
| ✏️ | `src/app/api/google-ads/route.ts` | POST: `set_device_bid_modifier`, `set_ad_schedule_bid_modifier`, `set_location_bid_modifier` |
| ✏️ | `src/app/api/google-ads/ai/route.ts` | 3 tools + `executeTool` + reglas en system prompt (confirmación) |

Reutiliza `gaqlSearch`, `gaqlMutate`, `extractId`. Mismo patrón que los helpers de escritura de Fase 1.

## 4. Setters (en `googleAdsClient.ts`)

**Clamp (riel #1):**
```ts
function clampBidModifier(m: number): number { return Math.min(3.0, Math.max(0.1, m)); } // −90%..+200%
```
`bidModifier` = multiplicador (1.0 = sin cambio, 0.8 = −20%, 1.3 = +30%).

- **`setDeviceBidModifier(customerId, token, campaignResourceName, device, bidModifier)`**
  Device es a nivel **ad group** (`ad_group_bid_modifier`). Enumera los ad groups de la campaña
  (`SELECT ad_group.resource_name FROM ad_group WHERE campaign.id = {id} AND ad_group.status != 'REMOVED'`)
  y para cada uno hace **upsert**: busca `ad_group_bid_modifier` con ese `device.type`; si existe → `update`
  (`updateMask: "bidModifier"`), si no → `create` `{ adGroup, device: { type }, bidModifier }`. `device` ∈
  {MOBILE, DESKTOP, TABLET}. Devuelve cuántos ad groups se ajustaron. Errores por ad group → se cuentan/omiten.

- **`setAdScheduleBidModifier(customerId, token, campaignResourceName, schedule, bidModifier)`**
  `schedule = { dayOfWeek, startHour, endHour }`. Crea `campaign_criterion`:
  `{ campaign, adSchedule: { dayOfWeek, startHour, startMinute: "ZERO", endHour, endMinute: "ZERO" }, bidModifier }`.
  `dayOfWeek` ∈ MONDAY..SUNDAY; `startHour` 0-23; `endHour` 1-24. (Campos a verificar en vivo.)

- **`setLocationBidModifier(customerId, token, campaignResourceName, locationName, bidModifier)`**
  Resuelve `locationName` → `geoTargetConstant` (reusa la lógica de `addLocationTargeting`). Busca el
  `campaign_criterion` de tipo LOCATION de la campaña con ese geo target
  (`SELECT campaign_criterion.resource_name FROM campaign_criterion WHERE campaign.id = {id} AND campaign_criterion.type = 'LOCATION'`)
  y actualiza su `bidModifier` (`updateMask: "bidModifier"`). Si no existe el criterio, lo crea con
  `{ campaign, location: { geoTargetConstant }, bidModifier }`.

Todos aplican `clampBidModifier` al entrar. En caso de fallo de la API lanzan un `Error` con mensaje claro
(la tool/endpoint lo captura y lo reporta; nunca aplican algo distinto a lo pedido). `setDeviceBidModifier`
devuelve el número de ad groups ajustados; los otros dos no devuelven valor (éxito = sin throw).

## 5. `/api/google-ads/route.ts` — POST actions

Tres bloques nuevos (mismo patrón que `update_budget`), validando inputs:
- `set_device_bid_modifier` `{ campaignResourceName, device, bidModifier }`
- `set_ad_schedule_bid_modifier` `{ campaignResourceName, schedule, bidModifier }`
- `set_location_bid_modifier` `{ campaignResourceName, locationName, bidModifier }`
Reutilizan `writeLimiter`, auth y `getCustomerId`.

## 6. `/api/google-ads/ai/route.ts` — tools + prompt

3 tools (`set_device_bid_modifier`, `set_ad_schedule_bid_modifier`, `set_location_bid_modifier`) con
`bid_modifier: number` + los params correspondientes. `executeTool` mapea a los setters (el clamp vive en el
cliente). **System prompt — añadir a SEGURIDAD/OPTIMIZAR:** "Los modificadores de puja CAMBIAN cuánto se gasta
→ aplícalos SOLO tras un 'sí' explícito. Recomienda primero (con los segmentos), confirma, luego aplica. El
valor se acota automáticamente a −90%..+200%."

## 7. Riel #3 — degradación elegante

Si un payload es rechazado por la API (campo inválido, etc.), el setter falla con un mensaje claro; la tool lo
devuelve a la IA, que le dice al usuario "no se pudo aplicar (motivo); no cambié nada". Nunca aplica algo
distinto a lo pedido.

## 8. Testing / verificación

- Sin infra de tests → `next build` + prueba manual EN VIVO sobre una campaña real:
  - "baja −30% la puja en desktop" → confirmar → la IA aplica → verificar en Google Ads UI que el modificador de
    dispositivo quedó en 0.70 en el/los ad group(s).
  - "sube +20% de 7pm a 11pm" (ad schedule) y "−20% en una ciudad de bajo rendimiento" (location), verificando en
    la UI. Si la API rechaza un campo de `ad_schedule`/location, ajustar nombres y reintentar.

## 9. Decisiones resueltas

1. Los **3** modificadores (device/horario/ubicación), no solo uno.
2. **Rieles**: clamp [0.1, 3.0], confirmación obligatoria, degradación elegante, verify-live.
3. Sin UI nueva; la IA aplica tras confirmación.
