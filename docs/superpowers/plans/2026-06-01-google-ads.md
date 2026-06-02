# Google Ads Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar Google Ads con OAuth popup, token encriptado en Firestore, API proxy server-side con GAQL, y dashboard propio en `/dashboard/google-ads`.

**Architecture:** Mismo patrón que Meta y TikTok — OAuth popup → callback guarda refresh_token encriptado en Firestore → API routes leen credenciales del server (nunca del cliente) → `googleAdsClient.ts` habla con Google Ads REST API v18 → dashboard en `/dashboard/google-ads/page.tsx`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Firebase Admin SDK, Google Ads REST API v18, GAQL, AES-256-GCM (`tokenCrypto.ts`), HMAC-SHA256 state (`oauthState.ts`), `createRateLimiter`, Recharts, Tailwind CSS, Framer Motion.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `env.example` | Modificar | Agregar 4 vars de Google Ads |
| `src/app/api/tokens/route.ts` | Modificar | Agregar campos Google Ads a ENCRYPTED_FIELDS y PLAIN_FIELDS |
| `src/lib/googleAdsClient.ts` | Crear | Cliente REST API v18: tipos, helper GAQL, refresh token, todas las funciones |
| `src/app/api/auth/google-ads/state/route.ts` | Crear | Genera state HMAC firmado para OAuth |
| `src/app/api/auth/google-ads/callback/route.ts` | Crear | Intercambia code → tokens, guarda en Firestore, cierra popup |
| `src/app/api/google-ads/resources/route.ts` | Crear | Lista Customer IDs accesibles desde el MCC |
| `src/app/api/google-ads/route.ts` | Crear | GET (campaigns/adGroups/ads/keywords/reporting/account) + POST (pause/enable/remove/update_budget/create_campaign) |
| `src/app/dashboard/google-ads/GoogleAdsConnect.tsx` | Crear | Botón OAuth + selector de Customer ID |
| `src/app/dashboard/google-ads/page.tsx` | Crear | Dashboard completo: resumen, campañas, keywords, anuncios, billing |

---

## Task 1: Variables de entorno

**Files:**
- Modify: `env.example`

- [ ] **Agregar las 4 variables al final de la sección de integraciones en `env.example`**

Agregar después de la sección de TikTok Ads (busca `NEXT_PUBLIC_TIKTOK_APP_ID`):

```bash
# ─── Google Ads ───────────────────────────────────────────────────────
# Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs
# Redirect URI a registrar: ${NEXT_PUBLIC_SITE_URL}/api/auth/google-ads/callback
# En dev: http://localhost:3000/api/auth/google-ads/callback
NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
# Google Ads → Tools & Settings → API Center → Developer token
GOOGLE_ADS_DEVELOPER_TOKEN=
# Manager Account ID (MCC) sin guiones, ej: 1234567890
GOOGLE_ADS_LOGIN_CUSTOMER_ID=
```

- [ ] **Agregar las mismas 4 variables a `.env.local`** (con valores reales del cliente)

- [ ] **Commit**

```bash
git add env.example
git commit -m "chore: add Google Ads env vars to env.example"
```

---

## Task 2: Actualizar `/api/tokens/route.ts`

**Files:**
- Modify: `src/app/api/tokens/route.ts:10-13`

- [ ] **Agregar campos de Google Ads a las constantes de campos**

Localizar estas líneas en el archivo:
```typescript
const ENCRYPTED_FIELDS = ["metaAccessToken", "nanoBananaApiKey", "tiktokAccessToken"] as const;
const PLAIN_FIELDS = ["metaAdAccountId", "metaPageId", "tiktokAdvertiserId"] as const;
```

Reemplazarlas con:
```typescript
const ENCRYPTED_FIELDS = [
  "metaAccessToken",
  "nanoBananaApiKey",
  "tiktokAccessToken",
  "googleAdsRefreshToken",
  "googleAdsAccessToken",
] as const;

const PLAIN_FIELDS = [
  "metaAdAccountId",
  "metaPageId",
  "tiktokAdvertiserId",
  "googleAdsCustomerId",
] as const;
```

- [ ] **Verificar que el servidor compila sin errores**

```bash
cd E:\Indexa && npx tsc --noEmit 2>&1 | head -20
```

Esperado: sin errores relacionados con tokens.

- [ ] **Commit**

```bash
git add src/app/api/tokens/route.ts
git commit -m "feat(tokens): add Google Ads fields to token store"
```

---

## Task 3: Crear `src/lib/googleAdsClient.ts`

**Files:**
- Create: `src/lib/googleAdsClient.ts`

Este es el archivo más importante. Maneja todas las llamadas a la API y el refresh automático de tokens.

- [ ] **Crear el archivo completo**

```typescript
/**
 * Google Ads REST API v18 client — server-side only.
 *
 * Refresh automático: si el access_token está próximo a vencer (< 5 min),
 * lo renueva usando el refresh_token y actualiza Firestore sin que el usuario
 * note nada.
 *
 * Todos los amounts en Google Ads son en "micros" (1 USD = 1,000,000 micros).
 * Las funciones de este cliente convierten a valores normales antes de retornar.
 */

import { getAdminDb } from "@/lib/firebaseAdmin";
import { encryptToken, decryptToken } from "@/lib/tokenCrypto";

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v18";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refrescar si expira en < 5 min

// ── Types ─────────────────────────────────────────────────────────────

export interface GoogleAdsCampaign {
  campaignId: string;
  campaignName: string;
  status: string;
  channelType: string;
  dailyBudgetMicros: number;
  dailyBudget: number;
  startDate: string;
  endDate?: string;
  resourceName: string;
  budgetResourceName: string;
}

export interface GoogleAdsAdGroup {
  adGroupId: string;
  adGroupName: string;
  campaignId: string;
  status: string;
  type: string;
  resourceName: string;
}

export interface GoogleAdsAd {
  adId: string;
  adName: string;
  adType: string;
  status: string;
  adGroupId: string;
  campaignId: string;
  resourceName: string;
}

export interface GoogleAdsKeyword {
  keywordId: string;
  text: string;
  matchType: string;
  status: string;
  qualityScore: number | null;
  adGroupId: string;
  campaignId: string;
  resourceName: string;
}

export interface GoogleAdsReportRow {
  date: string;
  campaignId: string;
  campaignName: string;
  costMicros: number;
  cost: number;
  clicks: number;
  impressions: number;
  ctr: number;
  averageCpc: number;
  conversions: number;
  costPerConversion: number;
}

export interface GoogleAdsAccountInfo {
  customerId: string;
  descriptiveName: string;
  currencyCode: string;
  timeZone: string;
}

export interface GoogleAdsAccountBudget {
  amountServedMicros: number;
  amountServed: number;
  status: string;
}

export interface GoogleAdsCustomer {
  id: string;
  name: string;
  currencyCode: string;
  timeZone: string;
  status: string;
}

export interface CreateCampaignParams {
  campaignName: string;
  dailyBudgetMicros: number;
  startDate: string;
  endDate?: string;
  targetCountry: string;
  adGroupName: string;
  keywords: Array<{ text: string; matchType: "EXACT" | "PHRASE" | "BROAD" }>;
  adHeadlines: string[];
  adDescriptions: string[];
  finalUrl: string;
}

export interface CreateCampaignResult {
  campaignId: string;
  budgetId: string;
  adGroupId: string;
  adId: string;
  keywordCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────

function getEnv() {
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

  if (!clientSecret || !clientId || !developerToken || !loginCustomerId) {
    throw new Error(
      "Google Ads env vars missing: GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_CLIENT_ID, " +
      "GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_LOGIN_CUSTOMER_ID"
    );
  }
  return { clientSecret, clientId, developerToken, loginCustomerId };
}

function microsToUnit(micros: string | number): number {
  return Number(micros) / 1_000_000;
}

function extractId(resourceName: string): string {
  return resourceName.split("/").pop() ?? "";
}

function getDateRange(range: string): { startDate: string; endDate: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const sub = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return d;
  };

  switch (range) {
    case "LAST_7_DAYS":
      return { startDate: fmt(sub(7)), endDate: fmt(sub(1)) };
    case "LAST_30_DAYS":
      return { startDate: fmt(sub(30)), endDate: fmt(sub(1)) };
    case "THIS_MONTH": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: fmt(first), endDate: fmt(sub(1)) };
    }
    case "LAST_MONTH": {
      const firstThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastMonth = new Date(firstThisMonth);
      lastMonth.setDate(0);
      const firstLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
      return { startDate: fmt(firstLastMonth), endDate: fmt(lastMonth) };
    }
    default:
      return { startDate: fmt(sub(7)), endDate: fmt(sub(1)) };
  }
}

// ── Token Refresh ─────────────────────────────────────────────────────

/**
 * Returns a valid access token for the given user.
 * Refreshes automatically if it expires in < 5 minutes.
 * All API routes call this instead of reading the token from the client.
 */
export async function getValidAccessToken(uid: string): Promise<string> {
  const db = getAdminDb();
  const snap = await db.collection("usuarios").doc(uid).get();
  if (!snap.exists) throw new Error("Usuario no encontrado en Firestore.");

  const data = snap.data()!;
  const encryptedRefresh = data.googleAdsRefreshToken as string | undefined;
  const encryptedAccess = data.googleAdsAccessToken as string | undefined;
  const expiresAt = data.googleAdsTokenExpiresAt as number | undefined;

  if (!encryptedRefresh) {
    throw new Error("No hay cuenta de Google Ads conectada.");
  }

  // Return existing access token if still valid
  if (encryptedAccess && expiresAt && Date.now() < expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return decryptToken(encryptedAccess);
  }

  // Refresh the access token
  const refreshToken = decryptToken(encryptedRefresh);
  const { clientId, clientSecret } = getEnv();

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const tokenData = await res.json() as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !tokenData.access_token) {
    throw new Error(
      `Google token refresh failed: ${tokenData.error_description || tokenData.error || res.statusText}`
    );
  }

  const newExpiresAt = Date.now() + (tokenData.expires_in ?? 3600) * 1000;

  // Persist refreshed token (encrypted)
  await db.collection("usuarios").doc(uid).update({
    googleAdsAccessToken: encryptToken(tokenData.access_token),
    googleAdsTokenExpiresAt: newExpiresAt,
  });

  return tokenData.access_token;
}

// ── Core API Helpers ──────────────────────────────────────────────────

interface SearchResponse<T> {
  results?: T[];
  totalResultsCount?: string;
}

async function gaqlSearch<T>(
  customerId: string,
  accessToken: string,
  query: string
): Promise<T[]> {
  const { developerToken, loginCustomerId } = getEnv();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let res: Response;
  try {
    res = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "login-customer-id": loginCustomerId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      }
    );
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Google Ads API timeout en query: ${query.slice(0, 80)}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "(sin cuerpo)");
    let parsed: { error?: { message?: string; status?: string } } = {};
    try { parsed = JSON.parse(text); } catch { /* ignore */ }
    throw new Error(
      `Google Ads API HTTP ${res.status}: ${parsed.error?.message || text.slice(0, 300)}`
    );
  }

  const data = await res.json() as SearchResponse<T>;
  return data.results ?? [];
}

async function gaqlMutate<T>(
  customerId: string,
  accessToken: string,
  resource: string,
  operations: unknown[]
): Promise<T> {
  const { developerToken, loginCustomerId } = getEnv();

  const res = await fetch(
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/${resource}:mutate`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "login-customer-id": loginCustomerId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operations }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "(sin cuerpo)");
    let parsed: { error?: { message?: string } } = {};
    try { parsed = JSON.parse(text); } catch { /* ignore */ }
    throw new Error(
      `Google Ads mutate ${resource} HTTP ${res.status}: ${parsed.error?.message || text.slice(0, 300)}`
    );
  }

  return res.json() as Promise<T>;
}

// ── Read Functions ────────────────────────────────────────────────────

export async function getAccountInfo(
  customerId: string,
  accessToken: string
): Promise<GoogleAdsAccountInfo> {
  type Row = {
    customer: {
      resourceName: string;
      id: string;
      descriptiveName: string;
      currencyCode: string;
      timeZone: string;
    };
  };

  const rows = await gaqlSearch<Row>(
    customerId,
    accessToken,
    `SELECT customer.id, customer.descriptive_name,
            customer.currency_code, customer.time_zone
     FROM customer LIMIT 1`
  );

  const c = rows[0]?.customer;
  return {
    customerId: c?.id ?? customerId,
    descriptiveName: c?.descriptiveName ?? "",
    currencyCode: c?.currencyCode ?? "MXN",
    timeZone: c?.timeZone ?? "America/Mexico_City",
  };
}

export async function getCampaigns(
  customerId: string,
  accessToken: string
): Promise<GoogleAdsCampaign[]> {
  type Row = {
    campaign: {
      resourceName: string;
      id: string;
      name: string;
      status: string;
      advertisingChannelType: string;
      startDate: string;
      endDate?: string;
    };
    campaignBudget: {
      resourceName: string;
      amountMicros: string;
    };
  };

  const rows = await gaqlSearch<Row>(
    customerId,
    accessToken,
    `SELECT campaign.id, campaign.name, campaign.status,
            campaign.advertising_channel_type,
            campaign.start_date, campaign.end_date,
            campaign_budget.amount_micros, campaign_budget.resource_name
     FROM campaign
     WHERE campaign.status != 'REMOVED'
     ORDER BY campaign.name
     LIMIT 100`
  );

  return rows.map((r) => ({
    campaignId: r.campaign.id,
    campaignName: r.campaign.name,
    status: r.campaign.status,
    channelType: r.campaign.advertisingChannelType,
    dailyBudgetMicros: Number(r.campaignBudget?.amountMicros ?? 0),
    dailyBudget: microsToUnit(r.campaignBudget?.amountMicros ?? 0),
    startDate: r.campaign.startDate,
    endDate: r.campaign.endDate,
    resourceName: r.campaign.resourceName,
    budgetResourceName: r.campaignBudget?.resourceName ?? "",
  }));
}

export async function getAdGroups(
  customerId: string,
  accessToken: string,
  campaignId?: string
): Promise<GoogleAdsAdGroup[]> {
  type Row = {
    adGroup: {
      resourceName: string;
      id: string;
      name: string;
      status: string;
      type: string;
    };
    campaign: { id: string };
  };

  const whereClause = campaignId
    ? `WHERE ad_group.status != 'REMOVED' AND campaign.id = '${campaignId}'`
    : `WHERE ad_group.status != 'REMOVED'`;

  const rows = await gaqlSearch<Row>(
    customerId,
    accessToken,
    `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type,
            campaign.id
     FROM ad_group
     ${whereClause}
     ORDER BY ad_group.name
     LIMIT 200`
  );

  return rows.map((r) => ({
    adGroupId: r.adGroup.id,
    adGroupName: r.adGroup.name,
    campaignId: r.campaign.id,
    status: r.adGroup.status,
    type: r.adGroup.type,
    resourceName: r.adGroup.resourceName,
  }));
}

export async function getAds(
  customerId: string,
  accessToken: string,
  campaignId?: string
): Promise<GoogleAdsAd[]> {
  type Row = {
    adGroupAd: {
      resourceName: string;
      status: string;
      ad: { id: string; name?: string; type: string };
    };
    adGroup: { id: string };
    campaign: { id: string };
  };

  const whereClause = campaignId
    ? `WHERE ad_group_ad.status != 'REMOVED' AND campaign.id = '${campaignId}'`
    : `WHERE ad_group_ad.status != 'REMOVED'`;

  const rows = await gaqlSearch<Row>(
    customerId,
    accessToken,
    `SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type,
            ad_group_ad.status, ad_group.id, campaign.id
     FROM ad_group_ad
     ${whereClause}
     LIMIT 200`
  );

  return rows.map((r) => ({
    adId: r.adGroupAd.ad.id,
    adName: r.adGroupAd.ad.name ?? `Ad ${r.adGroupAd.ad.id}`,
    adType: r.adGroupAd.ad.type,
    status: r.adGroupAd.status,
    adGroupId: r.adGroup.id,
    campaignId: r.campaign.id,
    resourceName: r.adGroupAd.resourceName,
  }));
}

export async function getKeywords(
  customerId: string,
  accessToken: string,
  campaignId?: string
): Promise<GoogleAdsKeyword[]> {
  type Row = {
    adGroupCriterion: {
      resourceName: string;
      criterionId: string;
      status: string;
      keyword: { text: string; matchType: string };
      qualityInfo?: { qualityScore?: number };
    };
    adGroup: { id: string };
    campaign: { id: string };
  };

  const whereClause = campaignId
    ? `WHERE ad_group_criterion.type = 'KEYWORD'
         AND ad_group_criterion.status != 'REMOVED'
         AND campaign.id = '${campaignId}'`
    : `WHERE ad_group_criterion.type = 'KEYWORD'
         AND ad_group_criterion.status != 'REMOVED'`;

  const rows = await gaqlSearch<Row>(
    customerId,
    accessToken,
    `SELECT ad_group_criterion.criterion_id,
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            ad_group_criterion.status,
            ad_group_criterion.quality_info.quality_score,
            ad_group.id, campaign.id
     FROM ad_group_criterion
     ${whereClause}
     LIMIT 500`
  );

  return rows.map((r) => ({
    keywordId: r.adGroupCriterion.criterionId,
    text: r.adGroupCriterion.keyword.text,
    matchType: r.adGroupCriterion.keyword.matchType,
    status: r.adGroupCriterion.status,
    qualityScore: r.adGroupCriterion.qualityInfo?.qualityScore ?? null,
    adGroupId: r.adGroup.id,
    campaignId: r.campaign.id,
    resourceName: r.adGroupCriterion.resourceName,
  }));
}

export async function getReporting(
  customerId: string,
  accessToken: string,
  dateRange: string
): Promise<GoogleAdsReportRow[]> {
  type Row = {
    campaign: { id: string; name: string };
    metrics: {
      costMicros: string;
      clicks: string;
      impressions: string;
      ctr: string;
      averageCpc: string;
      conversions: string;
      costPerConversion: string;
    };
    segments: { date: string };
  };

  const { startDate, endDate } = getDateRange(dateRange);

  const rows = await gaqlSearch<Row>(
    customerId,
    accessToken,
    `SELECT campaign.id, campaign.name,
            metrics.cost_micros, metrics.clicks, metrics.impressions,
            metrics.ctr, metrics.average_cpc, metrics.conversions,
            metrics.cost_per_conversion, segments.date
     FROM campaign
     WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
       AND campaign.status != 'REMOVED'
     ORDER BY segments.date`
  );

  return rows.map((r) => ({
    date: r.segments.date,
    campaignId: r.campaign.id,
    campaignName: r.campaign.name,
    costMicros: Number(r.metrics.costMicros ?? 0),
    cost: microsToUnit(r.metrics.costMicros ?? 0),
    clicks: Number(r.metrics.clicks ?? 0),
    impressions: Number(r.metrics.impressions ?? 0),
    ctr: Number(r.metrics.ctr ?? 0),
    averageCpc: microsToUnit(r.metrics.averageCpc ?? 0),
    conversions: Number(r.metrics.conversions ?? 0),
    costPerConversion: microsToUnit(r.metrics.costPerConversion ?? 0),
  }));
}

export async function getAccountBudget(
  customerId: string,
  accessToken: string
): Promise<GoogleAdsAccountBudget | null> {
  type Row = {
    accountBudget: {
      amountServedMicros: string;
      status: string;
    };
  };

  const rows = await gaqlSearch<Row>(
    customerId,
    accessToken,
    `SELECT account_budget.amount_served_micros, account_budget.status
     FROM account_budget
     WHERE account_budget.status = 'APPROVED'
     LIMIT 1`
  );

  if (!rows.length) return null;

  const b = rows[0].accountBudget;
  return {
    amountServedMicros: Number(b.amountServedMicros ?? 0),
    amountServed: microsToUnit(b.amountServedMicros ?? 0),
    status: b.status,
  };
}

// ── List accessible customers from MCC ──────────────────────────────

export async function getAccessibleCustomers(
  accessToken: string
): Promise<GoogleAdsCustomer[]> {
  const { developerToken, loginCustomerId } = getEnv();

  // Step 1: Get resource names list
  const listRes = await fetch(
    `${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`,
    {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "login-customer-id": loginCustomerId,
      },
    }
  );

  if (!listRes.ok) {
    const text = await listRes.text().catch(() => "");
    throw new Error(`listAccessibleCustomers HTTP ${listRes.status}: ${text.slice(0, 200)}`);
  }

  const { resourceNames } = await listRes.json() as { resourceNames?: string[] };
  if (!resourceNames?.length) return [];

  // Step 2: Query customer_client from MCC
  type Row = {
    customerClient: {
      id: string;
      descriptiveName: string;
      currencyCode: string;
      timeZone: string;
      status: string;
    };
  };

  const rows = await gaqlSearch<Row>(
    loginCustomerId,
    accessToken,
    `SELECT customer_client.id, customer_client.descriptive_name,
            customer_client.currency_code, customer_client.time_zone,
            customer_client.status
     FROM customer_client
     WHERE customer_client.level = 1
       AND customer_client.status = 'ENABLED'
     LIMIT 50`
  );

  return rows.map((r) => ({
    id: r.customerClient.id,
    name: r.customerClient.descriptiveName,
    currencyCode: r.customerClient.currencyCode,
    timeZone: r.customerClient.timeZone,
    status: r.customerClient.status,
  }));
}

// ── Write Functions ───────────────────────────────────────────────────

export async function updateCampaignStatus(
  customerId: string,
  accessToken: string,
  campaignResourceName: string,
  status: "ENABLED" | "PAUSED" | "REMOVED"
): Promise<void> {
  await gaqlMutate(customerId, accessToken, "campaigns", [
    {
      updateMask: "status",
      update: { resourceName: campaignResourceName, status },
    },
  ]);
}

export async function updateCampaignBudget(
  customerId: string,
  accessToken: string,
  budgetResourceName: string,
  amountMicros: number
): Promise<void> {
  await gaqlMutate(customerId, accessToken, "campaignBudgets", [
    {
      updateMask: "amountMicros",
      update: { resourceName: budgetResourceName, amountMicros: String(amountMicros) },
    },
  ]);
}

export async function createFullCampaign(
  customerId: string,
  accessToken: string,
  params: CreateCampaignParams
): Promise<CreateCampaignResult> {
  type MutateResponse = {
    results: Array<{ resourceName: string }>;
  };

  // 1. Create budget
  const budgetRes = await gaqlMutate<MutateResponse>(
    customerId, accessToken, "campaignBudgets",
    [{
      create: {
        name: `${params.campaignName} - Budget`,
        amountMicros: String(params.dailyBudgetMicros),
        deliveryMethod: "STANDARD",
      },
    }]
  );
  const budgetResourceName = budgetRes.results[0].resourceName;
  const budgetId = extractId(budgetResourceName);

  // 2. Create campaign
  const campaignPayload: Record<string, unknown> = {
    name: params.campaignName,
    advertisingChannelType: "SEARCH",
    status: "PAUSED",
    campaignBudget: budgetResourceName,
    startDate: params.startDate,
    networkSettings: {
      targetGoogleSearch: true,
      targetSearchNetwork: true,
      targetContentNetwork: false,
    },
  };
  if (params.endDate) campaignPayload.endDate = params.endDate;

  const campaignRes = await gaqlMutate<MutateResponse>(
    customerId, accessToken, "campaigns",
    [{ create: campaignPayload }]
  );
  const campaignResourceName = campaignRes.results[0].resourceName;
  const campaignId = extractId(campaignResourceName);

  // 3. Create ad group
  const adGroupRes = await gaqlMutate<MutateResponse>(
    customerId, accessToken, "adGroups",
    [{
      create: {
        name: params.adGroupName,
        campaign: campaignResourceName,
        type: "SEARCH_STANDARD",
        status: "PAUSED",
      },
    }]
  );
  const adGroupResourceName = adGroupRes.results[0].resourceName;
  const adGroupId = extractId(adGroupResourceName);

  // 4. Create keywords
  const keywordOps = params.keywords.map((kw) => ({
    create: {
      adGroup: adGroupResourceName,
      status: "ENABLED",
      keyword: { text: kw.text, matchType: kw.matchType },
    },
  }));
  await gaqlMutate(customerId, accessToken, "adGroupCriteria", keywordOps);

  // 5. Create responsive search ad (max 15 headlines, 4 descriptions)
  const headlines = params.adHeadlines.slice(0, 15).map((text) => ({ text }));
  const descriptions = params.adDescriptions.slice(0, 4).map((text) => ({ text }));

  const adRes = await gaqlMutate<MutateResponse>(
    customerId, accessToken, "adGroupAds",
    [{
      create: {
        adGroup: adGroupResourceName,
        status: "PAUSED",
        ad: {
          responsiveSearchAd: { headlines, descriptions },
          finalUrls: [params.finalUrl],
        },
      },
    }]
  );
  const adId = extractId(adRes.results[0].resourceName);

  return { campaignId, budgetId, adGroupId, adId, keywordCount: params.keywords.length };
}
```

- [ ] **Verificar tipos sin errores**

```bash
cd E:\Indexa && npx tsc --noEmit 2>&1 | head -30
```

Esperado: 0 errores en `googleAdsClient.ts`.

- [ ] **Commit**

```bash
git add src/lib/googleAdsClient.ts
git commit -m "feat(google-ads): add googleAdsClient with REST API v18, GAQL, token refresh"
```

---

## Task 4: Crear `/api/auth/google-ads/state/route.ts`

**Files:**
- Create: `src/app/api/auth/google-ads/state/route.ts`

- [ ] **Crear el archivo**

```typescript
/**
 * Genera el `state` firmado para el OAuth popup de Google Ads.
 * Idéntico al patrón de /api/auth/meta/state.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verifyAuth";
import { signState } from "@/lib/oauthState";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const user = await verifyIdToken(idToken);
  if (!user) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID no configurado." },
      { status: 503 }
    );
  }

  const state = signState(user.uid, "google-ads");
  return NextResponse.json({ state, clientId });
}
```

- [ ] **Commit**

```bash
git add src/app/api/auth/google-ads/state/route.ts
git commit -m "feat(google-ads): add OAuth state endpoint"
```

---

## Task 5: Crear `/api/auth/google-ads/callback/route.ts`

**Files:**
- Create: `src/app/api/auth/google-ads/callback/route.ts`

- [ ] **Crear el archivo**

```typescript
/**
 * Google Ads OAuth callback.
 *
 * Flow:
 *   1. Google redirige aquí con code + state después de que el usuario autoriza.
 *   2. Verificamos el state HMAC para recuperar el UID.
 *   3. Intercambiamos code → { access_token, refresh_token }.
 *   4. Guardamos ambos tokens (encriptados) en Firestore.
 *   5. Renderizamos HTML que postMessage("google-ads-oauth-success") y se cierra.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyState } from "@/lib/oauthState";
import { encryptToken } from "@/lib/tokenCrypto";
import { getAdminDb } from "@/lib/firebaseAdmin";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function popupHtml(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const isSuccess = payload.type === "google-ads-oauth-success";
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Google Ads — ${isSuccess ? "Conectado" : "Error"}</title>
<style>
  body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;
       font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
       background:#0a0a0f;color:#fff;text-align:center;padding:24px}
  .ok{color:#10b981}.err{color:#ef4444}
  h1{font-size:18px;margin:0 0 6px}p{font-size:13px;color:#94a3b8;margin:0}
</style></head>
<body>
  <div>
    <h1 class="${isSuccess ? "ok" : "err"}">
      ${isSuccess ? "✓ Google Ads conectado" : "Error al conectar"}
    </h1>
    <p>${isSuccess ? "Esta ventana se cerrará automáticamente…" : String(payload.error || "Cierra esta ventana e intenta de nuevo.")}</p>
  </div>
  <script>
    (function(){
      try {
        if (window.opener) {
          window.opener.postMessage(${json}, window.location.origin);
        }
      } catch(e) {}
      setTimeout(function(){ try { window.close(); } catch(e){} }, 600);
    })();
  </script>
</body></html>`;
}

function htmlResponse(payload: Record<string, unknown>, status = 200) {
  return new NextResponse(popupHtml(payload), {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // User denied access
  if (error) {
    return htmlResponse({ type: "google-ads-oauth-error", error: error });
  }

  if (!code || !state) {
    return htmlResponse({ type: "google-ads-oauth-error", error: "Faltan parámetros." }, 400);
  }

  const verified = verifyState(state, "google-ads");
  if (!verified) {
    return htmlResponse({ type: "google-ads-oauth-error", error: "State inválido o expirado." }, 400);
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `${url.protocol}//${url.host}`;
  const redirectUri = `${siteUrl}/api/auth/google-ads/callback`;

  if (!clientId || !clientSecret) {
    return htmlResponse(
      { type: "google-ads-oauth-error", error: "Google Ads no está configurado en el servidor." },
      503
    );
  }

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenData.access_token) {
      return htmlResponse({
        type: "google-ads-oauth-error",
        error: tokenData.error_description || tokenData.error || "Falló el intercambio de código.",
      });
    }

    if (!tokenData.refresh_token) {
      return htmlResponse({
        type: "google-ads-oauth-error",
        error: "Google no entregó refresh_token. Revoca el acceso en myaccount.google.com/permissions y vuelve a conectar.",
      });
    }

    const expiresAt = Date.now() + (tokenData.expires_in ?? 3600) * 1000;

    await getAdminDb()
      .collection("usuarios")
      .doc(verified.uid)
      .set(
        {
          googleAdsRefreshToken: encryptToken(tokenData.refresh_token),
          googleAdsAccessToken: encryptToken(tokenData.access_token),
          googleAdsTokenExpiresAt: expiresAt,
          googleAdsConnectedAt: Date.now(),
        },
        { merge: true }
      );

    return htmlResponse({ type: "google-ads-oauth-success" });
  } catch (err) {
    console.error("[google-ads/callback] error:", err instanceof Error ? err.message : err);
    return htmlResponse({
      type: "google-ads-oauth-error",
      error: "Error de conexión con Google.",
    });
  }
}
```

- [ ] **Commit**

```bash
git add src/app/api/auth/google-ads/callback/route.ts
git commit -m "feat(google-ads): add OAuth callback — exchanges code, saves encrypted tokens"
```

---

## Task 6: Crear `/api/google-ads/resources/route.ts`

**Files:**
- Create: `src/app/api/google-ads/resources/route.ts`

- [ ] **Crear el archivo**

```typescript
/**
 * Lista los Customer IDs accesibles desde el MCC configurado.
 * Lee el token de Firestore (nunca del cliente).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verifyAuth";
import { getValidAccessToken, getAccessibleCustomers } from "@/lib/googleAdsClient";
import { createRateLimiter } from "@/lib/rateLimit";

export const maxDuration = 30;

const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!limiter.check(ip)) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const user = await verifyIdToken(idToken);
  if (!user) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

  try {
    const accessToken = await getValidAccessToken(user.uid);
    const customers = await getAccessibleCustomers(accessToken);
    return NextResponse.json({ customers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido.";
    console.error("[google-ads/resources]", msg);
    const status = msg.includes("No hay cuenta") ? 404 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
```

- [ ] **Commit**

```bash
git add src/app/api/google-ads/resources/route.ts
git commit -m "feat(google-ads): add resources endpoint — lists MCC customer IDs"
```

---

## Task 7: Crear `/api/google-ads/route.ts` — GET (lectura)

**Files:**
- Create: `src/app/api/google-ads/route.ts`

- [ ] **Crear el archivo con el handler GET completo**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verifyAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { createRateLimiter } from "@/lib/rateLimit";
import {
  getValidAccessToken,
  getCampaigns,
  getAdGroups,
  getAds,
  getKeywords,
  getReporting,
  getAccountInfo,
  getAccountBudget,
} from "@/lib/googleAdsClient";

export const maxDuration = 60;

const limiter = createRateLimiter({ windowMs: 60_000, max: 20 });

async function getCustomerId(uid: string): Promise<string> {
  const snap = await getAdminDb().collection("usuarios").doc(uid).get();
  const customerId = snap.data()?.googleAdsCustomerId as string | undefined;
  if (!customerId) throw new Error("No hay Customer ID de Google Ads configurado.");
  return customerId;
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!limiter.check(ip)) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const user = await verifyIdToken(idToken);
  if (!user) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action") || "campaigns";
  const campaignId = searchParams.get("campaignId") ?? undefined;
  const dateRange = searchParams.get("dateRange") || "LAST_7_DAYS";

  try {
    const [accessToken, customerId] = await Promise.all([
      getValidAccessToken(user.uid),
      getCustomerId(user.uid),
    ]);

    switch (action) {
      case "campaigns": {
        const campaigns = await getCampaigns(customerId, accessToken);
        return NextResponse.json({ campaigns });
      }
      case "ad_groups": {
        const adGroups = await getAdGroups(customerId, accessToken, campaignId);
        return NextResponse.json({ adGroups });
      }
      case "ads": {
        const ads = await getAds(customerId, accessToken, campaignId);
        return NextResponse.json({ ads });
      }
      case "keywords": {
        const keywords = await getKeywords(customerId, accessToken, campaignId);
        return NextResponse.json({ keywords });
      }
      case "reporting": {
        const rows = await getReporting(customerId, accessToken, dateRange);
        return NextResponse.json({ rows });
      }
      case "account_info": {
        const info = await getAccountInfo(customerId, accessToken);
        return NextResponse.json({ info });
      }
      case "account_budget": {
        const budget = await getAccountBudget(customerId, accessToken);
        return NextResponse.json({ budget });
      }
      default:
        return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido.";
    console.error(`[google-ads GET action=${action}]`, msg);
    const status = msg.includes("No hay") ? 404 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
```

- [ ] **Commit**

```bash
git add src/app/api/google-ads/route.ts
git commit -m "feat(google-ads): add GET route for campaigns/adGroups/ads/keywords/reporting"
```

---

## Task 8: Agregar POST handler a `/api/google-ads/route.ts`

**Files:**
- Modify: `src/app/api/google-ads/route.ts`

- [ ] **Agregar el handler POST al final del archivo** (después del `export async function GET`)

```typescript
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!writeLimiter.check(ip)) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const user = await verifyIdToken(idToken);
  if (!user) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const { action } = body as { action?: string };

  try {
    const [accessToken, customerId] = await Promise.all([
      getValidAccessToken(user.uid),
      getCustomerId(user.uid),
    ]);

    if (action === "pause" || action === "enable" || action === "remove") {
      const { campaignResourceName } = body as { campaignResourceName?: string };
      if (!campaignResourceName) {
        return NextResponse.json({ error: "Falta campaignResourceName." }, { status: 400 });
      }
      const statusMap = { pause: "PAUSED", enable: "ENABLED", remove: "REMOVED" } as const;
      const { updateCampaignStatus } = await import("@/lib/googleAdsClient");
      await updateCampaignStatus(customerId, accessToken, campaignResourceName, statusMap[action as keyof typeof statusMap]);
      return NextResponse.json({ success: true, status: statusMap[action as keyof typeof statusMap] });
    }

    if (action === "update_budget") {
      const { budgetResourceName, amountMicros } = body as {
        budgetResourceName?: string;
        amountMicros?: number;
      };
      if (!budgetResourceName || amountMicros === undefined) {
        return NextResponse.json({ error: "Faltan budgetResourceName o amountMicros." }, { status: 400 });
      }
      const { updateCampaignBudget } = await import("@/lib/googleAdsClient");
      await updateCampaignBudget(customerId, accessToken, budgetResourceName, amountMicros);
      return NextResponse.json({ success: true });
    }

    if (action === "create_campaign") {
      const {
        campaignName, dailyBudgetMicros, startDate, endDate,
        targetCountry, adGroupName, keywords, adHeadlines, adDescriptions, finalUrl,
      } = body as {
        campaignName?: string; dailyBudgetMicros?: number; startDate?: string;
        endDate?: string; targetCountry?: string; adGroupName?: string;
        keywords?: Array<{ text: string; matchType: "EXACT" | "PHRASE" | "BROAD" }>;
        adHeadlines?: string[]; adDescriptions?: string[]; finalUrl?: string;
      };

      if (!campaignName || !dailyBudgetMicros || !startDate || !adGroupName ||
          !keywords?.length || !adHeadlines?.length || !adDescriptions?.length || !finalUrl) {
        return NextResponse.json({ error: "Faltan parámetros para crear la campaña." }, { status: 400 });
      }

      const { createFullCampaign } = await import("@/lib/googleAdsClient");
      const result = await createFullCampaign(customerId, accessToken, {
        campaignName, dailyBudgetMicros, startDate, endDate,
        targetCountry: targetCountry ?? "MX",
        adGroupName, keywords, adHeadlines, adDescriptions, finalUrl,
      });

      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido.";
    console.error(`[google-ads POST action=${action}]`, msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
```

- [ ] **Verificar que TypeScript compila**

```bash
cd E:\Indexa && npx tsc --noEmit 2>&1 | grep -i "google-ads\|googleAds" | head -20
```

Esperado: sin errores.

- [ ] **Commit**

```bash
git add src/app/api/google-ads/route.ts
git commit -m "feat(google-ads): add POST route for pause/enable/remove/update_budget/create_campaign"
```

---

## Task 9: Crear `GoogleAdsConnect.tsx`

**Files:**
- Create: `src/app/dashboard/google-ads/GoogleAdsConnect.tsx`

- [ ] **Crear el directorio y el archivo**

```bash
New-Item -ItemType Directory -Force "E:\Indexa\src\app\dashboard\google-ads"
```

- [ ] **Crear el componente completo**

```typescript
"use client";

/**
 * Google Ads OAuth connector — idéntico en estructura a MetaConnect.tsx.
 *
 * 1. POST /api/auth/google-ads/state → { state, clientId }
 * 2. Abre popup en accounts.google.com/o/oauth2/v2/auth
 * 3. Callback guarda tokens → postMessage("google-ads-oauth-success")
 * 4. Fetch /api/google-ads/resources → lista Customer IDs del MCC
 * 5. Usuario elige → POST /api/tokens { googleAdsCustomerId }
 * 6. onConnected() notifica al padre
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Check, AlertCircle, X, Building2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

interface GoogleCustomer {
  id: string;
  name: string;
  currencyCode: string;
  timeZone: string;
}

interface Props {
  onConnected: () => void;
  alreadyConnected?: boolean;
}

const SCOPES = "https://www.googleapis.com/auth/adwords";

export default function GoogleAdsConnect({ onConnected, alreadyConnected = false }: Props) {
  const { user } = useAuth();

  const [phase, setPhase] = useState<
    "idle" | "popup" | "fetching" | "selecting" | "saving" | "error"
  >("idle");
  const [error, setError] = useState("");
  const [customers, setCustomers] = useState<GoogleCustomer[]>([]);
  const [pickedCustomer, setPickedCustomer] = useState("");

  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const fetchResources = useCallback(async () => {
    if (!user) return;
    setPhase("fetching");
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/google-ads/resources", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar las cuentas.");
      setCustomers(data.customers ?? []);
      if (data.customers?.length === 1) setPickedCustomer(data.customers[0].id);
      setPhase("selecting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
      setPhase("error");
    }
  }, [user]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; error?: string } | null;
      if (!data?.type) return;
      if (data.type === "google-ads-oauth-success") {
        if (pollRef.current) clearInterval(pollRef.current);
        fetchResources();
      } else if (data.type === "google-ads-oauth-error") {
        if (pollRef.current) clearInterval(pollRef.current);
        setError(data.error || "Conexión cancelada.");
        setPhase("error");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [fetchResources]);

  const startOAuth = useCallback(async () => {
    if (!user) return;
    setError("");
    setPhase("popup");

    let stateData: { state: string; clientId: string };
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/auth/google-ads/state", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      stateData = await res.json();
      if (!res.ok) throw new Error((stateData as unknown as { error?: string }).error || "No se pudo iniciar.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar OAuth.");
      setPhase("error");
      return;
    }

    const redirectUri = `${window.location.origin}/api/auth/google-ads/callback`;
    const oauthUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      new URLSearchParams({
        client_id: stateData.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
        state: stateData.state,
      });

    const w = 600;
    const h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    popupRef.current = window.open(
      oauthUrl,
      "google-ads-oauth",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
    );

    if (!popupRef.current) {
      setError("Tu navegador bloqueó la ventana. Permite popups e intenta de nuevo.");
      setPhase("error");
      return;
    }

    pollRef.current = setInterval(() => {
      if (popupRef.current?.closed) {
        if (pollRef.current) clearInterval(pollRef.current);
        setPhase((p) => {
          if (p === "popup") {
            setError("Cancelaste la conexión.");
            return "error";
          }
          return p;
        });
      }
    }, 700);
  }, [user]);

  const saveSelection = useCallback(async () => {
    if (!user || !pickedCustomer) return;
    setPhase("saving");
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          action: "save",
          tokens: { googleAdsCustomerId: pickedCustomer },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || "No se pudo guardar.");
      }
      onConnected();
      setPhase("idle");
      setCustomers([]);
      setPickedCustomer("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
      setPhase("error");
    }
  }, [user, pickedCustomer, onConnected]);

  const closeSelector = () => {
    setPhase("idle");
    setCustomers([]);
    setPickedCustomer("");
  };

  return (
    <>
      <button
        onClick={startOAuth}
        disabled={phase === "popup" || phase === "fetching" || phase === "saving"}
        className="group relative inline-flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-[#4285F4] to-[#1a73e8] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-60"
      >
        {phase === "popup" || phase === "fetching" ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/>
          </svg>
        )}
        {phase === "popup"
          ? "Esperando autorización…"
          : phase === "fetching"
            ? "Cargando cuentas…"
            : alreadyConnected
              ? "Volver a conectar Google Ads"
              : "Conectar Google Ads"}
      </button>

      {error && phase === "error" && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setPhase("idle")} className="text-red-400 hover:text-red-200">
            <X size={14} />
          </button>
        </div>
      )}

      {(phase === "selecting" || phase === "saving") && customers.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f17] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4285F4]/15 text-[#4285F4]">
                  <Check size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">¡Google Ads conectado!</h3>
                  <p className="text-xs text-white/50">Elige la cuenta que deseas gestionar.</p>
                </div>
              </div>
              <button
                onClick={closeSelector}
                className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-6 py-5 space-y-2">
              {customers.map((c) => {
                const picked = pickedCustomer === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPickedCustomer(c.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                      picked
                        ? "border-[#4285F4] bg-[#4285F4]/10 ring-2 ring-[#4285F4]/30"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5">
                        <Building2 size={16} className="text-white/60" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{c.name}</p>
                        <p className="text-[11px] text-white/40">
                          ID: {c.id} · {c.currencyCode} · {c.timeZone}
                        </p>
                      </div>
                    </div>
                    {picked && <Check size={16} className="text-[#4285F4]" />}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
              <p className="text-[11px] text-white/40">Token guardado encriptado. Desconecta cuando quieras.</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={closeSelector}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white/60 hover:bg-white/5 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveSelection}
                  disabled={!pickedCustomer || phase === "saving"}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#4285F4] px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#3367d6] disabled:opacity-50"
                >
                  {phase === "saving" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Guardar y conectar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Commit**

```bash
git add src/app/dashboard/google-ads/GoogleAdsConnect.tsx
git commit -m "feat(google-ads): add GoogleAdsConnect OAuth popup component"
```

---

## Task 10: Crear `/dashboard/google-ads/page.tsx`

**Files:**
- Create: `src/app/dashboard/google-ads/page.tsx`

Esta es la página principal del dashboard de Google Ads. Sigue el mismo patrón visual que `/dashboard/tiktok/page.tsx`.

- [ ] **Crear el archivo completo**

```typescript
"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import type { SitioData, UserProfile } from "@/types/lead";
import { PaywallOverlay, PaywallModal } from "@/components/PaywallGate";
import { motion } from "framer-motion";
import {
  Loader2, AlertCircle, RefreshCw, ExternalLink, ChevronLeft,
  Play, Pause, Trash2, DollarSign, MousePointerClick, Eye,
  TrendingUp, Search, Key, BarChart3, Check,
} from "lucide-react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import GoogleAdsConnect from "./GoogleAdsConnect";
import type {
  GoogleAdsCampaign, GoogleAdsKeyword, GoogleAdsReportRow, GoogleAdsAccountInfo,
} from "@/lib/googleAdsClient";

// ── Types ─────────────────────────────────────────────────────────────
type Tab = "resumen" | "campanas" | "keywords" | "anuncios";

// ── Helpers ───────────────────────────────────────────────────────────
function fmtMoney(val: number, currency = "MXN"): string {
  return val.toLocaleString("es-MX", { style: "currency", currency, maximumFractionDigits: 2 });
}

function fmtNum(val: number): string {
  return val.toLocaleString("es-MX");
}

function campaignStatusLabel(status: string): { text: string; color: string; bg: string } {
  switch (status) {
    case "ENABLED":  return { text: "Activa",  color: "text-emerald-400", bg: "bg-emerald-500/10" };
    case "PAUSED":   return { text: "Pausada", color: "text-amber-400",   bg: "bg-amber-500/10"  };
    case "REMOVED":  return { text: "Eliminada",color: "text-white/40",   bg: "bg-white/5"       };
    default:         return { text: status,    color: "text-white/40",    bg: "bg-white/5"       };
  }
}

function matchTypeLabel(t: string): string {
  return { EXACT: "Exacta", PHRASE: "Frase", BROAD: "Amplia" }[t] ?? t;
}

const DATE_RANGES = [
  { value: "LAST_7_DAYS",  label: "Últimos 7 días"  },
  { value: "LAST_30_DAYS", label: "Últimos 30 días" },
  { value: "THIS_MONTH",   label: "Este mes"         },
  { value: "LAST_MONTH",   label: "Mes anterior"     },
];

// ── Main component ─────────────────────────────────────────────────────
export default function GoogleAdsDashboard() {
  const { user, loading: authLoading, role: authRole } = useAuth();

  const [pageLoading, setPageLoading] = useState(true);
  const [sitio, setSitio] = useState<SitioData | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState("");

  // Connection state
  const [customerId, setCustomerId] = useState("");
  const [accountInfo, setAccountInfo] = useState<GoogleAdsAccountInfo | null>(null);

  // Data
  const [tab, setTab] = useState<Tab>("resumen");
  const [dateRange, setDateRange] = useState("LAST_7_DAYS");
  const [campaigns, setCampaigns] = useState<GoogleAdsCampaign[]>([]);
  const [keywords, setKeywords] = useState<GoogleAdsKeyword[]>([]);
  const [reportRows, setReportRows] = useState<GoogleAdsReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const isActive = sitio?.statusPago === "activo" || authRole === "superadmin";
  const isConnected = !!customerId;

  // ── Load user + sitio ────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const [tokensRes, profileSnap] = await Promise.all([
          fetch("/api/tokens", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({ action: "load" }),
          }),
          getDoc(doc(db, "usuarios", user.uid)),
        ]);

        const { tokens } = await tokensRes.json();
        if (tokens?.googleAdsCustomerId) setCustomerId(tokens.googleAdsCustomerId);

        const profileData = profileSnap.data() as UserProfile | undefined;
        if (profileData?.sitioId) {
          const sitioSnap = await getDoc(doc(db, "sitios", profileData.sitioId));
          if (sitioSnap.exists()) setSitio(sitioSnap.data() as SitioData);
        }
      } catch (e) {
        console.error("[google-ads dashboard]", e);
      } finally {
        setPageLoading(false);
      }
    })();
  }, [user, authLoading]);

  // ── API helper ───────────────────────────────────────────────────
  const apiFetch = useCallback(async (action: string, params: Record<string, string> = {}) => {
    if (!user) return null;
    const idToken = await user.getIdToken();
    const qs = new URLSearchParams({ action, ...params });
    const res = await fetch(`/api/google-ads?${qs}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al consultar Google Ads.");
    return data;
  }, [user]);

  const apiPost = useCallback(async (body: Record<string, unknown>) => {
    if (!user) return null;
    const idToken = await user.getIdToken();
    const res = await fetch("/api/google-ads", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al ejecutar acción.");
    return data;
  }, [user]);

  // ── Load data ────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    setError("");
    try {
      const [info, campaignData, reportData] = await Promise.all([
        apiFetch("account_info"),
        apiFetch("campaigns"),
        apiFetch("reporting", { dateRange }),
      ]);
      if (info?.info) setAccountInfo(info.info);
      if (campaignData?.campaigns) setCampaigns(campaignData.campaigns);
      if (reportData?.rows) setReportRows(reportData.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos.");
    } finally {
      setLoading(false);
    }
  }, [isConnected, apiFetch, dateRange]);

  useEffect(() => {
    if (isConnected) loadData();
  }, [isConnected, loadData]);

  const loadKeywords = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    try {
      const data = await apiFetch("keywords");
      if (data?.keywords) setKeywords(data.keywords);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar keywords.");
    } finally {
      setLoading(false);
    }
  }, [isConnected, apiFetch]);

  useEffect(() => {
    if (tab === "keywords" && isConnected) loadKeywords();
  }, [tab, isConnected, loadKeywords]);

  // ── Campaign actions ─────────────────────────────────────────────
  const toggleCampaign = useCallback(async (campaign: GoogleAdsCampaign) => {
    const newAction = campaign.status === "ENABLED" ? "pause" : "enable";
    setActionLoading(campaign.campaignId);
    try {
      await apiPost({ action: newAction, campaignResourceName: campaign.resourceName });
      setCampaigns((prev) =>
        prev.map((c) =>
          c.campaignId === campaign.campaignId
            ? { ...c, status: newAction === "pause" ? "PAUSED" : "ENABLED" }
            : c
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cambiar estado.");
    } finally {
      setActionLoading(null);
    }
  }, [apiPost]);

  // ── Reporting aggregation ─────────────────────────────────────────
  const reportByDate = reportRows.reduce<Record<string, { date: string; cost: number; clicks: number; impressions: number }>>((acc, r) => {
    if (!acc[r.date]) acc[r.date] = { date: r.date, cost: 0, clicks: 0, impressions: 0 };
    acc[r.date].cost += r.cost;
    acc[r.date].clicks += r.clicks;
    acc[r.date].impressions += r.impressions;
    return acc;
  }, {});
  const chartData = Object.values(reportByDate).sort((a, b) => a.date.localeCompare(b.date));
  const totalSpend = reportRows.reduce((s, r) => s + r.cost, 0);
  const totalClicks = reportRows.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = reportRows.reduce((s, r) => s + r.impressions, 0);
  const totalConversions = reportRows.reduce((s, r) => s + r.conversions, 0);
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const currency = accountInfo?.currencyCode ?? "MXN";

  // ── Paywall guard ─────────────────────────────────────────────────
  const requireActive = (feature: string, action: () => void) => {
    if (!isActive) { setPaywallFeature(feature); setShowPaywall(true); return; }
    action();
  };

  if (pageLoading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
        <Loader2 size={28} className="animate-spin text-white/40" />
      </div>
    );
  }

  // ── Not connected ─────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] px-4 py-12">
        <div className="mx-auto max-w-md">
          <Link href="/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm text-white/40 hover:text-white">
            <ChevronLeft size={16} /> Dashboard
          </Link>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4285F4]/15">
                <Key size={24} className="text-[#4285F4]" />
              </div>
            </div>
            <h2 className="mb-2 text-lg font-bold text-white">Conecta Google Ads</h2>
            <p className="mb-6 text-sm text-white/50">
              Autoriza a Indexa para ver y gestionar tus campañas de Google Ads directamente desde el dashboard.
            </p>
            {!isActive && (
              <PaywallOverlay feature="Google Ads" className="mb-4">
                <GoogleAdsConnect onConnected={() => { setCustomerId("loading"); loadData(); }} />
              </PaywallOverlay>
            )}
            {isActive && (
              <GoogleAdsConnect
                onConnected={async () => {
                  // Reload customer ID from tokens
                  if (!user) return;
                  const idToken = await user.getIdToken();
                  const res = await fetch("/api/tokens", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                    body: JSON.stringify({ action: "load" }),
                  });
                  const { tokens } = await res.json();
                  if (tokens?.googleAdsCustomerId) setCustomerId(tokens.googleAdsCustomerId);
                }}
              />
            )}
          </div>
        </div>
        {showPaywall && (
          <PaywallModal feature={paywallFeature} onClose={() => setShowPaywall(false)} />
        )}
      </div>
    );
  }

  // ── Connected dashboard ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0f] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-white/40 hover:text-white">
              <ChevronLeft size={20} />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">Google Ads</h1>
              {accountInfo && (
                <p className="text-xs text-white/40">
                  {accountInfo.descriptiveName} · {accountInfo.customerId} · {accountInfo.currencyCode}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 focus:outline-none"
            >
              {DATE_RANGES.map((r) => (
                <option key={r.value} value={r.value} className="bg-[#0f0f17]">{r.label}</option>
              ))}
            </select>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Actualizar
            </button>
            <a
              href={`https://ads.google.com/aw/overview?ocid=${customerId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
            >
              <ExternalLink size={13} /> Google Ads
            </a>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertCircle size={16} /> {error}
            <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-200"><Trash2 size={14} /></button>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          {(["resumen", "campanas", "keywords", "anuncios"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-xl py-2 text-xs font-semibold capitalize transition-all ${
                tab === t ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              {t === "campanas" ? "Campañas" : t === "keywords" ? "Palabras clave" : t === "anuncios" ? "Anuncios" : "Resumen"}
            </button>
          ))}
        </div>

        {/* ── Resumen ── */}
        {tab === "resumen" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* KPI Cards */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "Gasto", value: fmtMoney(totalSpend, currency), icon: DollarSign, color: "text-emerald-400" },
                { label: "Clics", value: fmtNum(totalClicks), icon: MousePointerClick, color: "text-[#4285F4]" },
                { label: "Impresiones", value: fmtNum(totalImpressions), icon: Eye, color: "text-purple-400" },
                { label: "CTR", value: `${avgCtr.toFixed(2)}%`, icon: TrendingUp, color: "text-amber-400" },
                { label: "CPC prom.", value: fmtMoney(avgCpc, currency), icon: BarChart3, color: "text-pink-400" },
                { label: "Conversiones", value: fmtNum(totalConversions), icon: Check, color: "text-cyan-400" },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <kpi.icon size={16} className={`mb-2 ${kpi.color}`} />
                  <p className="text-[11px] text-white/40">{kpi.label}</p>
                  <p className="text-lg font-bold text-white">{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Chart */}
            {chartData.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="mb-4 text-sm font-semibold text-white/70">Gasto diario</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <Tooltip
                      contentStyle={{ background: "#0f0f17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                      labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                    />
                    <Line type="monotone" dataKey="cost" stroke="#4285F4" strokeWidth={2} dot={false} name="Gasto" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Billing shortcut */}
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-white">Saldo y facturación</p>
                <p className="text-xs text-white/40">El recargo de saldo se gestiona directamente en Google Ads.</p>
              </div>
              <a
                href={`https://ads.google.com/aw/billing/overview?ocid=${customerId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-[#4285F4]/10 px-4 py-2 text-sm font-semibold text-[#4285F4] hover:bg-[#4285F4]/20"
              >
                Recargar saldo <ExternalLink size={14} />
              </a>
            </div>
          </motion.div>
        )}

        {/* ── Campañas ── */}
        {tab === "campanas" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Campaña</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Tipo</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Presup./día</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Estado</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {campaigns.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-white/30">
                        {loading ? "Cargando campañas…" : "No hay campañas activas."}
                      </td>
                    </tr>
                  )}
                  {campaigns.map((c) => {
                    const s = campaignStatusLabel(c.status);
                    const isLoading = actionLoading === c.campaignId;
                    return (
                      <tr key={c.campaignId} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium text-white">{c.campaignName}</td>
                        <td className="px-4 py-3 text-xs text-white/50">{c.channelType}</td>
                        <td className="px-4 py-3 text-right text-white/70">
                          {fmtMoney(c.dailyBudget, currency)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.bg} ${s.color}`}>
                            {s.text}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => requireActive("Google Ads", () => toggleCampaign(c))}
                            disabled={isLoading || c.status === "REMOVED"}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/5 disabled:opacity-40"
                          >
                            {isLoading ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : c.status === "ENABLED" ? (
                              <><Pause size={12} /> Pausar</>
                            ) : (
                              <><Play size={12} /> Activar</>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* ── Keywords ── */}
        {tab === "keywords" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Keyword</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Tipo de concordancia</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-white/40">Quality Score</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {keywords.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-white/30">
                        {loading ? "Cargando keywords…" : "No hay keywords."}
                      </td>
                    </tr>
                  )}
                  {keywords.map((kw) => (
                    <tr key={kw.keywordId} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <Search size={12} className="text-white/30" />
                          {kw.text}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/50">
                          {matchTypeLabel(kw.matchType)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {kw.qualityScore !== null ? (
                          <span className={`font-bold ${kw.qualityScore >= 7 ? "text-emerald-400" : kw.qualityScore >= 4 ? "text-amber-400" : "text-red-400"}`}>
                            {kw.qualityScore}/10
                          </span>
                        ) : (
                          <span className="text-white/20">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          kw.status === "ENABLED" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                        }`}>
                          {kw.status === "ENABLED" ? "Activa" : "Pausada"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* ── Anuncios ── */}
        {tab === "anuncios" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
              <p className="text-sm text-white/40">
                Los anuncios se cargan desde las campañas. Selecciona una campaña en la pestaña{" "}
                <button onClick={() => setTab("campanas")} className="text-[#4285F4] underline">Campañas</button>{" "}
                para ver sus anuncios.
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {showPaywall && (
        <PaywallModal feature={paywallFeature} onClose={() => setShowPaywall(false)} />
      )}
    </div>
  );
}
```

- [ ] **Verificar TypeScript sin errores**

```bash
cd E:\Indexa && npx tsc --noEmit 2>&1 | head -40
```

Esperado: 0 errores en los archivos de Google Ads.

- [ ] **Commit**

```bash
git add src/app/dashboard/google-ads/
git commit -m "feat(google-ads): add full dashboard page — resumen, campañas, keywords, anuncios"
```

---

## Task 11: Smoke test en localhost

- [ ] **Arrancar el servidor de desarrollo**

```bash
cd E:\Indexa && npm run dev
```

- [ ] **Verificar que el build compila sin errores** (Next.js imprime errores de TS en consola)

- [ ] **Navegar a `http://localhost:3000/dashboard/google-ads`**
  - Esperado: Pantalla de "Conecta Google Ads" con botón azul.

- [ ] **Probar el flujo OAuth (requiere credenciales en `.env.local`)**
  1. Clic en "Conectar Google Ads"
  2. Popup de Google abre correctamente
  3. Autorizar → popup se cierra → aparece selector de Customer ID
  4. Elegir cuenta → clic "Guardar y conectar" → dashboard carga con datos

- [ ] **Verificar en Firestore (Firebase Console)**
  - `usuarios/{uid}` debe tener: `googleAdsRefreshToken` (comienza con `enc:v1:`), `googleAdsAccessToken` (ídem), `googleAdsCustomerId` (texto plano).

- [ ] **Verificar seguridad: token refresh automático**
  - En Firestore, cambiar `googleAdsTokenExpiresAt` a un valor pasado (e.g. `1`)
  - Recargar el dashboard → debe funcionar normalmente (refresh transparente)
  - En Firestore verificar que `googleAdsAccessToken` y `googleAdsTokenExpiresAt` se actualizaron

- [ ] **Commit final**

```bash
git add .
git commit -m "feat(google-ads): smoke test verified — integration complete"
```

---

## Self-Review del Plan

**Cobertura del spec:**
- ✅ OAuth popup flow (Tasks 4, 5, 9)
- ✅ Token storage encriptado (Task 2 — campos en tokens route)
- ✅ Refresh automático de access token (Task 3 — `getValidAccessToken`)
- ✅ MCC con `login-customer-id` en todos los requests (Task 3 — `getEnv()`)
- ✅ Rate limiting en todas las rutas (Tasks 6, 7, 8)
- ✅ Firebase ID token verificado en cada route (Tasks 5, 6, 7, 8)
- ✅ State HMAC firmado para CSRF (Task 4 — `signState("google-ads")`)
- ✅ Developer token solo en env server-side (Task 3 — `getEnv()`)
- ✅ GAQL queries para campaigns, adGroups, ads, keywords, reporting (Task 3)
- ✅ Mutate para pause/enable/remove/update_budget (Task 3 + 8)
- ✅ Create campaign completo (Task 3 — `createFullCampaign`)
- ✅ `getAccessibleCustomers` desde MCC (Task 3)
- ✅ Dashboard con resumen, campañas, keywords, anuncios (Task 10)
- ✅ Billing shortcut con link a Google Ads billing (Task 10)
- ✅ Recharts chart de gasto diario (Task 10)
- ✅ Env vars documentadas (Task 1)
- ✅ LocalHost compatible (Google acepta redirect a localhost)

**Consistencia de tipos:**
- `GoogleAdsCampaign.resourceName` definida en Task 3 → usada en Task 8 POST `campaignResourceName` ✅
- `GoogleAdsCampaign.budgetResourceName` definida en Task 3 → usada en Task 8 `budgetResourceName` ✅
- `getValidAccessToken(uid)` definida en Task 3 → llamada en Tasks 6, 7, 8 ✅
- `getAccessibleCustomers(accessToken)` definida en Task 3 → llamada en Task 6 ✅
