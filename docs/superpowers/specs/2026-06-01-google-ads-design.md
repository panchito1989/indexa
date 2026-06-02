# Google Ads Integration — Design Spec

**Date:** 2026-06-01
**Status:** Approved
**Approach:** REST API v18 directo (sin SDKs de terceros) — consistente con Meta y TikTok

---

## 1. Contexto y objetivo

Indexa ya tiene integración completa con Meta Ads y TikTok Ads. Este documento especifica la integración equivalente con **Google Ads** usando el mismo patrón arquitectónico: OAuth popup → token encriptado en Firestore → API proxy server-side → UI en el dashboard de marketing.

**Modelo de negocio:** Indexa es una agencia que opera un **MCC (Manager Account / cuenta administradora)**. Los usuarios de Indexa son clientes de la agencia. Al conectar Google Ads, el usuario autoriza a Indexa a acceder al MCC y luego selecciona su Customer ID específico.

---

## 2. Archivos a crear

```
src/
├── lib/
│   └── googleAdsClient.ts
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── google-ads/
│   │   │       ├── state/route.ts
│   │   │       └── callback/route.ts
│   │   └── google-ads/
│   │       ├── route.ts
│   │       └── resources/route.ts
│   └── dashboard/
│       └── marketing/
│           └── GoogleAdsConnect.tsx
```

**Archivos a modificar:**
- `src/app/api/tokens/route.ts` — agregar campos de Google Ads
- `env.example` — agregar variables de entorno
- `src/app/dashboard/marketing/page.tsx` — agregar tab Google Ads

---

## 3. Variables de entorno

```bash
# Google Ads OAuth (Google Cloud Console → Credenciales → OAuth 2.0)
NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID=   # Expuesto al browser para construir URL OAuth
GOOGLE_ADS_CLIENT_SECRET=           # Server-only, nunca expuesto

# Google Ads API (Google Ads → Herramientas → API Center)
GOOGLE_ADS_DEVELOPER_TOKEN=         # Server-only, requerido en cada request a la API

# MCC (Manager Account ID, sin guiones, e.g. "1234567890")
GOOGLE_ADS_LOGIN_CUSTOMER_ID=       # Server-only, el ID del MCC de la agencia
```

**Regla:** `NEXT_PUBLIC_*` solo para el Client ID que se usa en el browser para construir la URL de OAuth. Todos los secretos son server-only.

---

## 4. Flujo OAuth

```
1. Usuario hace clic en "Conectar con Google Ads"
2. Frontend POST /api/auth/google-ads/state
   → Servidor genera HMAC-SHA256(uid + timestamp, SECRET) → { state, clientId }
3. Frontend abre popup:
   https://accounts.google.com/o/oauth2/v2/auth?
     client_id={NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID}
     redirect_uri={SITE_URL}/api/auth/google-ads/callback
     scope=https://www.googleapis.com/auth/adwords
     response_type=code
     access_type=offline
     prompt=consent
     state={state}
4. Google redirige a /api/auth/google-ads/callback?code=...&state=...
5. Callback:
   a. Verifica state (HMAC + expiración 10 min)
   b. POST https://oauth2.googleapis.com/token → { access_token, refresh_token, expires_in }
   c. Guarda en Firestore (usuarios/{uid}):
      - googleAdsRefreshToken: encryptToken(refresh_token)
      - googleAdsAccessToken: encryptToken(access_token)
      - googleAdsTokenExpiresAt: Date.now() + expires_in * 1000
      - googleAdsConnectedAt: Date.now()
   d. Renderiza HTML que postMessage("google-ads-oauth-success") y cierra el popup
6. Frontend escucha postMessage → fetch /api/google-ads/resources
7. Usuario selecciona Customer ID → POST /api/tokens { googleAdsCustomerId }
```

**Nota desarrollo local:** Google OAuth sí acepta `http://localhost:3000` como redirect URI. No se necesita ngrok (a diferencia de TikTok).

---

## 5. Token Storage — campos en Firestore y `/api/tokens`

### Campos nuevos en `usuarios/{uid}`:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `googleAdsRefreshToken` | string (encriptado) | Refresh token permanente |
| `googleAdsAccessToken` | string (encriptado) | Access token, dura 1 hora |
| `googleAdsTokenExpiresAt` | number | Unix ms de expiración del access token |
| `googleAdsCustomerId` | string (plaintext) | Customer ID seleccionado (sin guiones) |
| `googleAdsConnectedAt` | number | Timestamp de la conexión inicial |

### Modificaciones a `/api/tokens/route.ts`:

```typescript
// Agregar a ENCRYPTED_FIELDS:
"googleAdsRefreshToken", "googleAdsAccessToken"

// Agregar a PLAIN_FIELDS:
"googleAdsCustomerId"
```

---

## 6. Refresh automático de Access Token

El access token de Google expira en 1 hora. `googleAdsClient.ts` implementa refresh transparente:

```
getValidAccessToken(uid):
  1. Lee googleAdsTokenExpiresAt de Firestore
  2. Si expires_in > 5 minutos → devuelve googleAdsAccessToken (desencriptado)
  3. Si expires_in ≤ 5 minutos:
     a. POST https://oauth2.googleapis.com/token
        { grant_type: refresh_token, refresh_token, client_id, client_secret }
     b. Guarda nuevo access_token (encriptado) y nueva expiración en Firestore
     c. Devuelve nuevo access_token
```

El usuario no nota nada. No se requiere re-autorización (solo si se revoca el refresh token).

---

## 7. API Routes

### `GET /api/auth/google-ads/state`
Genera state firmado. Requiere Firebase ID Token.
```json
Response: { "state": "...", "clientId": "..." }
```

### `GET /api/auth/google-ads/callback`
Intercambia code por tokens, guarda en Firestore, retorna HTML con postMessage.
Maneja errores de Google (`error` param) con HTML de error amigable.

### `GET /api/google-ads/resources`
Lista los Customer IDs accesibles desde el MCC.
- Auth: Firebase ID Token
- Rate limit: 10 req/min
- Usa `GOOGLE_ADS_LOGIN_CUSTOMER_ID` como login-customer-id
- GAQL:
  ```sql
  SELECT customer_client.id, customer_client.descriptive_name,
         customer_client.currency_code, customer_client.status,
         customer_client.time_zone
  FROM customer_client
  WHERE customer_client.level = 1
    AND customer_client.status = 'ENABLED'
  ```
- Response: `{ customers: [{ id, name, currencyCode, timeZone }] }`

### `GET /api/google-ads?action=X`
Proxy de lectura. Auth: Firebase ID Token. Rate limit: 20 req/min.
Credenciales leídas de Firestore (nunca de headers del cliente).

| action | GAQL |
|--------|------|
| `campaigns` | `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, campaign.start_date, campaign.end_date FROM campaign ORDER BY campaign.name` |
| `ad_groups` | `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, campaign.id FROM ad_group WHERE campaign.id = '{campaignId}'` |
| `ads` | `SELECT ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.ad.name, ad_group_ad.status, campaign.id, ad_group.id FROM ad_group_ad WHERE campaign.id = '{campaignId}'` |
| `keywords` | `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.quality_info.quality_score, ad_group.id, campaign.id FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD'` |
| `reporting` | `SELECT metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.ctr, metrics.average_cpc, metrics.conversions, metrics.cost_per_conversion, segments.date FROM campaign WHERE segments.date BETWEEN '{startDate}' AND '{endDate}'` |
| `account_info` | `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1` |
| `account_budget` | `SELECT account_budget.amount_served_micros, account_budget.status, account_budget.total_adjustments_micros FROM account_budget` |

**Params adicionales:**
- `action=reporting` acepta `dateRange` (`LAST_7_DAYS`, `LAST_30_DAYS`, `THIS_MONTH`)
- `action=ad_groups` y `action=ads` requieren `campaignId`
- `action=keywords` acepta `campaignId` opcional

### `POST /api/google-ads`
Mutaciones. Auth: Firebase ID Token. Rate limit: 10 req/min.

| action | Descripción | Payload |
|--------|-------------|---------|
| `pause` | Pausa campaña | `{ campaignId }` |
| `enable` | Activa campaña | `{ campaignId }` |
| `remove` | Elimina campaña | `{ campaignId }` |
| `update_budget` | Cambia presupuesto diario | `{ campaignBudgetId, amountMicros }` |
| `create_campaign` | Crea campaña Search completa | Ver sección 8 |

---

## 8. Crear campaña completa (POST action=create_campaign)

Payload:
```typescript
{
  action: "create_campaign",
  campaignName: string,
  dailyBudgetMicros: number,   // e.g. 100_000_000 = $100 MXN
  startDate: string,           // "YYYY-MM-DD"
  endDate?: string,
  targetCountry: string,       // "MX"
  targetLanguage: string,      // "1003" (Spanish)
  adGroupName: string,
  keywords: Array<{ text: string, matchType: "EXACT" | "PHRASE" | "BROAD" }>,
  adHeadlines: string[],       // max 15, cada uno max 30 chars
  adDescriptions: string[],    // max 4, cada uno max 90 chars
  finalUrl: string,
}
```

Secuencia de creación (todas pausadas hasta que el usuario active):
1. `POST customers/{id}/campaignBudgets:mutate` → budget resource name
2. `POST customers/{id}/campaigns:mutate` → campaign resource name
3. `POST customers/{id}/adGroups:mutate` → ad group resource name
4. `POST customers/{id}/adGroupCriteria:mutate` → keywords
5. `POST customers/{id}/adGroupAds:mutate` → responsive search ad

---

## 9. `googleAdsClient.ts` — estructura

```typescript
const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v18";
const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!;
const LOGIN_CUSTOMER_ID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!;

// Función core: refresca token si es necesario, luego hace el request
async function googleAdsFetch<T>(
  endpoint: string,
  accessToken: string,
  customerId: string,
  options: { method: "GET" | "POST"; body?: unknown }
): Promise<T>

// Headers requeridos en CADA request:
{
  "Authorization": `Bearer ${accessToken}`,
  "developer-token": DEVELOPER_TOKEN,
  "login-customer-id": LOGIN_CUSTOMER_ID,  // MCC ID
}

// Funciones exportadas:
export async function getValidAccessToken(uid: string): Promise<string>
export async function searchGoogleAds<T>(customerId, accessToken, gaqlQuery): Promise<T[]>
export async function getCampaigns(customerId, accessToken): Promise<GoogleAdsCampaign[]>
export async function getAdGroups(customerId, accessToken, campaignId?): Promise<GoogleAdsAdGroup[]>
export async function getAds(customerId, accessToken, campaignId?): Promise<GoogleAdsAd[]>
export async function getKeywords(customerId, accessToken, campaignId?): Promise<GoogleAdsKeyword[]>
export async function getReporting(customerId, accessToken, dateRange): Promise<GoogleAdsReportRow[]>
export async function getAccountInfo(customerId, accessToken): Promise<GoogleAdsAccountInfo>
export async function getAccountBudget(customerId, accessToken): Promise<GoogleAdsAccountBudget>
export async function updateCampaignStatus(customerId, accessToken, campaignId, status): Promise<void>
export async function updateCampaignBudget(customerId, accessToken, budgetId, amountMicros): Promise<void>
export async function createFullCampaign(customerId, accessToken, params): Promise<CreateCampaignResult>
export async function getAccessibleCustomers(accessToken): Promise<GoogleAdsCustomer[]>
```

**Conversión de micros:** Google Ads expresa dinero en micros (1,000,000 micros = 1 unidad de moneda). Todas las funciones del cliente convierten a valores normales antes de retornar.

---

## 10. `GoogleAdsConnect.tsx` — UI

Idéntico en estructura a `MetaConnect.tsx`:

**Estados:** `idle | popup | fetching | selecting | saving | error`

**Fases:**
1. Botón "Conectar con Google Ads" (azul Google)
2. Popup abre OAuth de Google
3. `postMessage("google-ads-oauth-success")` → fetch resources
4. Modal selector de Customer ID (una sola selección requerida)
5. Guardar → `onConnected()`

**Detector de popup cerrado:** mismo `setInterval` polling que Meta para detectar si el usuario cierra la ventana sin autorizar.

---

## 11. Tab Google Ads en el Dashboard de Marketing

Sección nueva dentro de `dashboard/marketing/page.tsx`:

**Subsecciones (tabs internos):**
- **Resumen** — cards de métricas: gasto, clicks, impresiones, CTR, CPC promedio, conversiones. Gráfica de línea por día (misma librería Recharts que ya usa el proyecto).
- **Campañas** — tabla con status badge, tipo (Search/Display/etc.), presupuesto diario, métricas del período. Acciones: Pausar / Activar / Ver ad groups.
- **Palabras clave** — tabla filtrable con texto, match type, quality score, estado.
- **Anuncios** — tabla de ads con tipo, estado, campaña asociada.
- **Billing** — card con gasto del período + botón "Recargar saldo →" que abre `https://ads.google.com/aw/billing/overview?ocid={customerId}` en nueva pestaña.

---

## 12. Seguridad — resumen completo

| Amenaza | Mitigación |
|---------|-----------|
| CSRF en OAuth | State HMAC-SHA256, expira 10 min, verificado en callback |
| Token expuesto en logs | Tokens solo en Firestore (encriptados), nunca en query params ni logs |
| Acceso no autorizado a la API | Firebase ID Token verificado en cada route |
| Abuso / scraping | `createRateLimiter` en todas las rutas |
| Developer Token filtrado | Exclusivamente en env var server-side |
| Refresh token comprometido | AES-256-GCM en reposo; revocable desde Google Account Security |
| Acceso entre usuarios | El UID del Firebase token determina qué credenciales se leen de Firestore |
| XSS via postMessage | `if (e.origin !== window.location.origin) return` en el listener |

---

## 13. Consideraciones de desarrollo local

- **Redirect URI permitido:** `http://localhost:3000/api/auth/google-ads/callback` — Google sí acepta localhost, agregar en Google Cloud Console → Credenciales → URIs de redireccionamiento autorizados.
- **Developer Token en pruebas:** Google otorga acceso de prueba (test account) antes de aprobar el Developer Token para producción. Las cuentas de prueba solo ven datos de cuentas de prueba de Google Ads.
- **`NEXT_PUBLIC_SITE_URL`:** Cambiar a `http://localhost:3000` en `.env.local` para desarrollo.
