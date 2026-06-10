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

## Fase B — Performance Max (siguiente)

Una sola campaña que cubre Búsqueda + Display + YouTube + Gmail + Maps. Para pymes suele
rendir más que armar cada canal por separado.

- AssetService: subir imágenes (ya tenemos generador: `/api/generate-image` con Gemini, o
  DALL-E como en meta-ads/ai) + textos. Crear en UN solo mutate: campaña PMax (PAUSED,
  maximizeConversions) + AssetGroup + AssetGroupAssets mínimos (3-5 headlines, 1 long
  headline 90c, 2-5 descriptions, business name, logo 1:1 ≥128px, marketing 1.91:1
  ≥600x314, square 1:1 ≥300x300). Requisito práctico: Fase A hecha (PMax vive de conversiones).
- Patrón de referencia: `create_full_campaign` de `src/app/api/meta-ads/ai/route.ts`
  (genera imagen → sube → crea estructura completa) + guard `DEADLINE_MS`.

## Fase C — Remarketing y audiencias

- UserListService: lista "Visitantes del sitio" (rule-based; la etiqueta de Fase A ya
  alimenta el remarketing tag). Mínimos de Google: ~100 usuarios activos (Display) /
  1,000 (Search RLSA) antes de servir.
- Customer Match (subir emails/teléfonos de leads del CRM Indexa) — requiere cumplir
  política y mínimos; los leads ya viven en Firestore (`leads`).
- Adjuntar audiencias a campañas/grupos (campaignCriteria/adGroupCriteria con userList,
  affinity, in-market) en modo observación o segmentación.

## Fase D — Display

- Campañas DISPLAY + ResponsiveDisplayAd (imágenes del generador + textos IA).
- Mismo pipeline de assets que PMax; útil para remarketing visual (Fase C).

## Fase E — Video (YouTube) y Demand Gen

- Campañas VIDEO/DEMAND_GEN vía API; el video debe existir como YouTube video ID
  (fricción pyme: pedir el link de YouTube; futuro: generar video con IA y subirlo).

## Fase F — Assets/extensiones y quick wins de Search

- Sitelinks, callouts, llamadas (teléfono del sitio), snippets estructurados, imagen —
  suben CTR sin costo. AssetService + CampaignAsset/CustomerAsset. MUY barato de agregar.
- Call ads / conversiones de llamada (categoría PHONE_CALL_LEAD).

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
