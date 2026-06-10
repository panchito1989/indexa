# Google Ads sin límites — mapa completo de capacidades y fases

Objetivo (Issac, 2026-06-10): que Indexa pueda hacer **todo** lo que permite Google Ads
para sus clientes. Este doc mapea TODO lo que ofrece la API (v22) a fases concretas,
ordenadas por impacto para pymes. Cada fase = un PR.

## Fase A — Conversiones + etiqueta automática ✅ (este PR)

El multiplicador de todo lo demás. Sin conversiones medidas, las campañas pujan a ciegas.

- Acción de conversión "Lead WhatsApp (Indexa)" (WEBPAGE/CONTACT/ONE_PER_CLICK) creada
  por el asistente vía API (`createConversionSetup` en `src/lib/googleAdsClient.ts`).
- **Etiqueta instalada automáticamente** en el sitio Indexa del cliente (ventaja única:
  controlamos los sitios). Denormalizada en `sitios/{id}.googleAdsTag` → `GoogleAdsTag.tsx`
  inyecta gtag y reporta conversión en cada clic a WhatsApp (botón flotante, CTAs de
  templates por delegación y links de la bio).
- Puja seleccionable en `create_search_campaign`: `MAXIMIZE_CLICKS` (default) o
  `MAXIMIZE_CONVERSIONS` (solo con medición activa + confirmación).
- Herramientas IA: `setup_conversion_tracking`, `get_conversion_tracking_status`.

## Fase B — Performance Max ✅

Una sola campaña que cubre Búsqueda + Display + YouTube + Gmail + Maps. Para pymes suele
rendir más que armar cada canal por separado.

- `createPerformanceMaxCampaign` (`src/lib/googleAdsClient.ts`): bulk mutate atómico
  (`googleAds:mutate` con temp resource names negativos) — presupuesto NO compartido +
  campaña PMax (PAUSED, maximizeConversions, declaración UE) + AssetGroup + assets
  mínimos (3-5 headlines, long headline, 2-5 descriptions con la 1ª ≤60, business name
  ≤25, marketing 1.91:1, square 1:1, logo 1:1) en UNA petición, como exige Google.
- Imágenes automáticas del sitio Indexa del cliente (`src/lib/adImages.ts` con sharp):
  recorte inteligente a 1200x628 / 1200x1200 / logo 512 contain. Fallbacks: galería,
  image_url/logo_url del usuario, logo desde la foto.
- Herramienta IA `create_performance_max_campaign` — exige Fase A hecha (PMax puja a
  conversiones); PAUSED + confirmación para activar; segmenta ubicación con
  addLocationTargeting.

## Fase C — Remarketing y audiencias ✅ (listas base) / pendiente: adjuntar + Customer Match

- ✅ `createRemarketingLists`: "Visitantes del sitio (Indexa)" (flexibleRule url__
  CONTAINS /sitio/{slug}, lifespan 90d, prepopulación solicitada) + "Convirtieron"
  (basicUserList sobre la acción de conversión de Fase A). Idempotente. Herramientas
  IA `create_remarketing_lists` y `list_audiences` (tamaños Display/Search).
- Pendiente: adjuntar audiencias a campañas (observación con targeting_setting
  bidOnly) cuando las listas tengan volumen (~100 Display / ~1,000 Search).
- Pendiente: Customer Match (subir emails/teléfonos de leads del CRM Indexa) —
  requiere política y mínimos; los leads ya viven en Firestore (`leads`).

## Fase D — Display

- Campañas DISPLAY + ResponsiveDisplayAd (imágenes del generador + textos IA).
- Mismo pipeline de assets que PMax; útil para remarketing visual (Fase C).

## Fase E — Video (YouTube) y Demand Gen

- Campañas VIDEO/DEMAND_GEN vía API; el video debe existir como YouTube video ID
  (fricción pyme: pedir el link de YouTube; futuro: generar video con IA y subirlo).

## Fase F — Assets/extensiones y quick wins de Search ✅ (callouts/snippet/llamada)

- ✅ `addCampaignExtensions` (bulk mutate assets + CampaignAsset): callouts (2-10,
  ≤25c), snippet estructurado ('Servicios' + 3-10 valores) y botón de llamada (usa el
  teléfono del sitio Indexa automáticamente; limpia lada 52/1). Herramienta IA
  `add_campaign_extensions` — el asistente la aplica tras crear campañas.
- Pendiente: sitelinks (los sitios Indexa son one-page; necesitan URLs distintas —
  evaluar /bio + anclas), asset de imagen en Search, call ads dedicados (PHONE_CALL_LEAD).

## Fase G — Inteligencia y mantenimiento

- KeywordPlanService (volúmenes e ideas de keywords para proponer mejores términos).
- RecommendationService (aplicar recomendaciones de Google con confirmación).
- Experiments (A/B de campañas), ChangeStatus (auditoría de cambios), BillingSetup
  (lectura de facturación), políticas/aprobaciones de anuncios (ad_group_ad.policy_summary).

## Qué NO permite la API (límites de Google, no de Indexa)

- Crear cuentas de facturación nuevas o cambiar tarjetas (solo lectura de billing).
- Subir videos a YouTube (se hace por YouTube Data API, no Google Ads).
- Algunos tipos: Smart Campaigns con limitaciones, Local Services Ads (API separada).

## Reglas transversales (ya vigentes)

- Todo lo que gasta se crea PAUSED y se activa solo con confirmación explícita en el chat.
- Errores con `[errorCode] — campo: <ruta>` (describeGoogleAdsError) y log de servidor.
- `maxDuration = 300` en `/api/google-ads/ai` para flujos largos de creación.
