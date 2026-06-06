# Diseño — Interfaz de Google Ads en el panel admin (v1)

**Fecha:** 2026-06-06
**Estado:** Aprobado (pendiente de plan de implementación)
**Enfoque elegido:** B — Espejo del dashboard + asistente IA

## 1. Objetivo

Agregar una página de gestión de **Google Ads** al **panel administrativo** (`/admin/campanas/google-ads`),
consistente con las páginas existentes de TikTok y Facebook. Gestiona **la cuenta de Google Ads de la
agencia** (un solo Customer ID conectado vía OAuth por el usuario admin), permitiendo ver métricas, gestionar
campañas/keywords/anuncios y consultar un **asistente IA** para análisis y optimización.

## 2. Alcance

**Incluye (v1):**
- Página admin con conexión OAuth y 5 tabs: Resumen, Campañas, Keywords, Anuncios, Asistente IA.
- Acciones de campaña: pausar/activar y **editar presupuesto diario**.
- Tab de Anuncios **poblada de verdad** (la API ya expone `ads`).
- Endpoint nuevo de asistente IA con tool-calling (lectura + análisis + pausar/presupuesto).
- Item de navegación "Google Ads" en el shell admin.

**Fuera de alcance (v1):**
- Crear campañas desde la IA (`create_campaign`) — mayor riesgo de mutación; se evalúa en v2.
- Vista por-cliente o agregada de todos los clientes (se eligió modelo "cuenta de la agencia").
- Acción destructiva `remove` campaña desde la IA.
- Cambios al dashboard cliente existente (`/dashboard/google-ads`).

## 3. Arquitectura y archivos

| Acción | Archivo | Propósito |
|--------|---------|-----------|
| 🆕 Crear | `src/app/admin/campanas/google-ads/page.tsx` | Página admin (shell claro, 5 tabs) |
| 🆕 Crear | `src/app/api/google-ads/ai/route.ts` | Endpoint del asistente IA (agente tool-calling) |
| ✏️ Editar | `src/app/admin/layout.tsx` | Agregar `{ href: "/admin/campanas/google-ads", label: "Google Ads", icon: Target }` a `NAV_ITEMS` (importar `Target` de lucide-react) |
| ♻️ Reutilizar | `src/app/api/google-ads/route.ts` | GET (campaigns, ad_groups, ads, keywords, reporting, account_info, account_budget) + POST (pause/enable, update_budget) — **sin cambios** |
| ♻️ Reutilizar | `src/app/dashboard/google-ads/GoogleAdsConnect.tsx` | Componente OAuth (popup) — sin cambios |
| ♻️ Reutilizar | `src/lib/googleAdsClient.ts` | Cliente y tipos (`GoogleAdsCampaign`, `GoogleAdsKeyword`, `GoogleAdsReportRow`, `GoogleAdsAccountInfo`, Ad/AdGroup) |

## 4. UI — `admin/campanas/google-ads/page.tsx`

**Tema:** claro, consistente con TikTok/Facebook admin (`bg-white` cards, `text-indexa-gray-dark`,
acentos en Google blue `#4285F4`). NO el tema oscuro del dashboard cliente.

**Estructura:**
- **Header:** título "Google Ads" + info de cuenta (descriptiveName · customerId · currency) +
  selector de rango (`LAST_7_DAYS`, `LAST_30_DAYS`, `THIS_MONTH`, `LAST_MONTH`) + botón Actualizar +
  link externo a `ads.google.com`.
- **Estado no conectado:** tarjeta con `<GoogleAdsConnect onConnected={...} />`. Al conectar, carga el
  `googleAdsCustomerId` desde `/api/tokens` (acción `load`).
- **Tabs:**
  - **Resumen:** 6 tarjetas KPI (Gasto, Clics, Impresiones, CTR, CPC prom., Conversiones) agregadas desde
    `reporting`, + gráfica de línea de gasto diario (recharts). Cálculos idénticos al dashboard cliente.
  - **Campañas:** tabla (Campaña, Tipo, Presup./día, Estado, Acciones). Acciones: botón pausar/activar
    (POST `pause`/`enable` con `campaignResourceName`) + **editar presupuesto** (input inline → POST
    `update_budget` con `budgetResourceName` + `amountMicros`).
  - **Keywords:** tabla (Keyword, Tipo de concordancia, Quality Score con color, Estado). Carga perezosa al
    abrir el tab (GET `keywords`).
  - **Anuncios:** tabla real (GET `ads`). Columnas sugeridas: anuncio/headline, campaña/ad group, estado.
    Carga perezosa al abrir el tab.
  - **Asistente IA:** chat (historial de mensajes + input). POST a `/api/google-ads/ai` con
    `{ message, history }`. Renderiza Markdown (tablas) en las respuestas. Indicador de carga.

**Estado React:** `tab`, `dateRange`, `customerId`, `accountInfo`, `campaigns`, `keywords`, `ads`,
`reportRows`, `loading`, `actionLoading`, `error`, `aiHistory`, `aiInput`, `aiLoading`.

**Auth/guard:** la página vive bajo el layout admin (ya exige Firebase auth). El nav filtra para que el rol
`subadmin` no la vea (no se agrega a `SUBADMIN_HREFS`). Sin paywall (es panel interno de la agencia).

## 5. Endpoint IA — `api/google-ads/ai/route.ts`

Espeja el patrón de `api/tiktok-ads/ai/route.ts`:

- **Proveedores LLM:** Anthropic Claude primary (`claude-sonnet-4-...`), con fallback a Groq
  (`llama-3.3-70b-versatile`) y Gemini (`gemini-2.0-flash`) ante errores de billing/quota/overload
  Para v1 se **duplican** los helpers `isBillingError`, `toGroqTools`, `toGroqMessages`,
  `fromGroqResponse` en el nuevo route (NO se refactoriza el route de TikTok, para evitar riesgo).
  Extraerlos a `src/lib/aiProviders.ts` queda como mejora futura.
- **Auth:** `verifyIdToken` (Firebase). Obtiene `accessToken` (`getValidAccessToken(uid)`) y `customerId`
  (de `usuarios/{uid}.googleAdsCustomerId`) como en `api/google-ads/route.ts`. Rate limiter (`max: 30/min`).
- **Tools → `googleAdsClient`:**
  - Lectura: `get_account_info`, `list_campaigns`, `list_ad_groups`, `list_ads`, `list_keywords`,
    `get_reporting` (días → dateRange), `get_budget`.
  - Optimización/mutación segura: `pause_campaign`, `resume_campaign`, `update_campaign_budget`,
    `analyze_performance` (filtra solo KPIs estándar y devuelve diagnóstico).
  - **Excluidos en v1:** `create_campaign`, `remove`.
- **System prompt** (español): rol de analista/optimizador de Google Ads; **benchmarks de Google Ads
  (búsqueda, mercado MX)** — NO los de TikTok; política de seguridad: procesar solo KPIs estándar
  (cost, impressions, clicks, ctr, cpc, conversions), "toda recomendación/cambio requiere validación
  humana", formato en tablas Markdown, montos `$1,234.56`.
- `maxDuration = 60` (no hay generación de imágenes/anuncios en v1).

## 6. Flujo de datos

```
Conectar:  page → GoogleAdsConnect (OAuth popup) → callback guarda tokens en usuarios/{adminUid}
           page → POST /api/tokens {action:load} → customerId
Leer:      page → GET  /api/google-ads?action=... → googleAdsClient → Google Ads API
Acciones:  page → POST /api/google-ads {action: pause|enable|update_budget, ...}
IA:        chat → POST /api/google-ads/ai {message, history} → agente(tools) → googleAdsClient
```

## 7. Manejo de errores

- Banner de error dismissable + estados `loading`/`actionLoading` por acción (patrón del dashboard).
- Rate limiting ya presente en los endpoints; el endpoint IA añade el suyo.
- IA: fallback de proveedor ante billing/quota; mensajes de error de Google Ads se muestran sin ocultar.
- Mutaciones (presupuesto/pausar) validan parámetros (`amountMicros`, resource names) en el endpoint existente.

## 8. Seguridad

- Solo admin autenticado (layout). `subadmin` excluido del nav.
- IA sin acciones destructivas ni creación en v1; cambios "requieren validación humana".
- Reutiliza rate limiters y sanitización de errores existentes.

## 9. Testing / verificación

- No hay infraestructura de tests (sin jest/vitest en el repo).
- Verificación: `next build` (type-check + lint estrictos) y prueba manual en el sitio desplegado tras
  conectar una cuenta de Google Ads (requiere credenciales de Google Ads configuradas — ver migración).

## 10. Decisiones resueltas

1. Editar presupuesto en Campañas → **SÍ** (API ya lo soporta).
2. Tab Anuncios real → **SÍ** (API expone `ads`).
3. IA sin `create_campaign` en v1 → **SÍ** (menor riesgo).
