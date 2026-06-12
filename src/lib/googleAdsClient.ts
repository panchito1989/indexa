/**
 * Google Ads REST API client (v22 by default) — server-side only.
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

// Google Ads API version. Versions sunset ~13 months after release; a sunset
// version returns an HTML "Error 404 (Not Found)" page instead of a JSON error.
// When that happens, bump this — overridable via GOOGLE_ADS_API_VERSION env var
// (no redeploy needed). Probe live versions with:
//   curl https://googleads.googleapis.com/vN/customers:listAccessibleCustomers
//   → HTTP 401 = valid, 404 = sunset.
const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v22";
const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refrescar si expira en < 5 min

// ── Types ─────────────────────────────────────────────────────────────

export interface GoogleAdsAuth {
  accessToken: string;
  loginCustomerId: string; // "" = direct mode (header falls back to the queried customerId)
}

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
  loginCustomerId: string;
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
  // MAXIMIZE_CONVERSIONS solo tiene sentido si la cuenta ya mide conversiones
  // (createConversionSetup); sin datos de conversión Google puja a ciegas.
  biddingStrategy?: "MAXIMIZE_CLICKS" | "MAXIMIZE_CONVERSIONS";
}

export interface CreateCampaignResult {
  campaignId: string;
  budgetId: string;
  adGroupId: string;
  adId: string;
  keywordCount: number;
  campaignResourceName: string;
}

export interface CreatePmaxParams {
  campaignName: string;
  dailyBudgetMicros: number;
  finalUrl: string;
  businessName: string; // ≤25 chars (límite de Google)
  headlines: string[]; // 3-5, ≤30 chars c/u
  longHeadline: string; // ≤90 chars
  descriptions: string[]; // 2-5; la primera ≤60 chars, el resto ≤90
  marketingImageB64: string; // JPEG/PNG 1.91:1 (p.ej. 1200x628)
  squareImageB64: string; // 1:1 (p.ej. 1200x1200)
  logoImageB64: string; // 1:1 (p.ej. 512x512)
}

export interface CreatePmaxResult {
  campaignId: string;
  budgetId: string;
  assetGroupId: string;
  campaignResourceName: string;
}

export interface GoogleAdsHourlyRow { hour: number; dayOfWeek: string; cost: number; clicks: number; impressions: number; conversions: number; ctr: number; avgCpc: number; }
export interface GoogleAdsDeviceRow { device: string; cost: number; clicks: number; impressions: number; conversions: number; ctr: number; avgCpc: number; }
export interface GoogleAdsGeoRow { locationId: string; locationName: string; cost: number; clicks: number; conversions: number; }
export interface GoogleAdsAudienceRow { name: string; type: string; cost: number; clicks: number; conversions: number; }
export interface GoogleAdsExtensionRow { assetId: string; type: string; name: string; cost: number; clicks: number; impressions: number; }

export interface GoogleAdsKeywordPerfRow {
  keywordId: string;
  text: string;
  matchType: string;
  campaignId: string;
  campaignName: string;
  cost: number;
  clicks: number;
  impressions: number;
  ctr: number;
  avgCpc: number;
  conversions: number;
  costPerConversion: number;
}

export interface GoogleAdsSearchTermRow {
  term: string;
  status: string;
  campaignName: string;
  cost: number;
  clicks: number;
  impressions: number;
  ctr: number;
  conversions: number;
  costPerConversion: number;
}

export interface DateRangeCustom {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

// ── Helpers ───────────────────────────────────────────────────────────

function getEnv() {
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  // The `login-customer-id` header must be digits only. The Google Ads UI shows the
  // manager (MCC) account ID with dashes (e.g. 123-456-7890); strip them, otherwise
  // the API rejects every request with 400 INVALID_ARGUMENT.
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, "") || "";

  if (!clientSecret || !clientId || !developerToken) {
    throw new Error(
      "Google Ads env vars missing: GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_CLIENT_ID, " +
      "GOOGLE_ADS_DEVELOPER_TOKEN"
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

function getDateRange(range: string, custom?: DateRangeCustom): { startDate: string; endDate: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const sub = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return d;
  };

  switch (range) {
    case "TODAY":
      return { startDate: fmt(today), endDate: fmt(today) };
    case "YESTERDAY":
      return { startDate: fmt(sub(1)), endDate: fmt(sub(1)) };
    case "LAST_7_DAYS":
      return { startDate: fmt(sub(7)), endDate: fmt(sub(1)) };
    case "LAST_30_DAYS":
      return { startDate: fmt(sub(30)), endDate: fmt(sub(1)) };
    case "LAST_90_DAYS":
      return { startDate: fmt(sub(90)), endDate: fmt(sub(1)) };
    case "LAST_12_MONTHS":
      return { startDate: fmt(sub(365)), endDate: fmt(sub(1)) };
    case "THIS_YEAR": {
      const first = new Date(today.getFullYear(), 0, 1);
      return { startDate: fmt(first), endDate: fmt(sub(1)) };
    }
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
    case "CUSTOM": {
      if (custom?.startDate && custom?.endDate) {
        return { startDate: custom.startDate, endDate: custom.endDate };
      }
      return { startDate: fmt(sub(7)), endDate: fmt(sub(1)) };
    }
    default:
      return { startDate: fmt(sub(7)), endDate: fmt(sub(1)) };
  }
}

/**
 * Predicado GAQL de fecha para el WHERE de las queries de métricas.
 *
 * Para los rangos con literal nativo de GAQL (TODAY, YESTERDAY, LAST_7_DAYS,
 * LAST_30_DAYS, THIS_MONTH, LAST_MONTH) usamos `segments.date DURING X`:
 * Google lo evalúa en la ZONA HORARIA DE LA CUENTA de Ads. Calcular la fecha
 * aquí con new Date()/toISOString() usa UTC (Vercel) — después de las ~18:00
 * de CDMX la fecha UTC ya es "mañana", por lo que "Hoy" devolvía 0 resultados
 * y "Ayer" mostraba los datos de hoy. Los rangos sin literal nativo
 * (90d, 12 meses, este año, CUSTOM) siguen con BETWEEN y fechas calculadas.
 */
function dateWhere(range: string, custom?: DateRangeCustom): string {
  switch (range) {
    case "TODAY":
    case "YESTERDAY":
    case "LAST_7_DAYS":
    case "LAST_30_DAYS":
    case "THIS_MONTH":
    case "LAST_MONTH":
      return `segments.date DURING ${range}`;
    default: {
      const { startDate, endDate } = getDateRange(range, custom);
      return `segments.date BETWEEN '${startDate}' AND '${endDate}'`;
    }
  }
}

// ── Token Refresh ─────────────────────────────────────────────────────

/**
 * Returns a valid access token for the given user.
 * Refreshes automatically if it expires in < 5 minutes.
 * All API routes call this instead of reading the token from the client.
 *
 * Agency-managed clients (usuarios/{uid}.googleAdsManagedByAgency === true) do NOT
 * hold their own token: we resolve to the agency owner's doc
 * (usuarios/{uid}.agencyId → agencias/{agencyId}.uid) and use/refresh THAT token.
 */
export async function getValidAccessToken(uid: string): Promise<string> {
  const db = getAdminDb();
  let tokenUid = uid;
  let snap = await db.collection("usuarios").doc(uid).get();
  if (!snap.exists) throw new Error("Usuario no encontrado en Firestore.");

  // Agency-managed client → use the agency owner's token, not the client's own.
  if (snap.data()!.googleAdsManagedByAgency === true) {
    const agencyId = snap.data()!.agencyId as string | undefined;
    if (!agencyId) throw new Error("No hay cuenta de Google Ads conectada.");
    const agSnap = await db.collection("agencias").doc(agencyId).get();
    const ownerUid = agSnap.exists ? (agSnap.data()!.uid as string | undefined) : undefined;
    if (!ownerUid) throw new Error("No hay cuenta de Google Ads conectada.");
    tokenUid = ownerUid;
    snap = await db.collection("usuarios").doc(ownerUid).get();
    if (!snap.exists) throw new Error("No hay cuenta de Google Ads conectada.");
  }

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

  // Persist refreshed token (encrypted) on the doc that OWNS the token
  // (the agency owner for managed clients, else the user themselves).
  await db.collection("usuarios").doc(tokenUid).update({
    googleAdsAccessToken: encryptToken(tokenData.access_token),
    googleAdsTokenExpiresAt: newExpiresAt,
  });

  return tokenData.access_token;
}

/**
 * Resolves everything needed to call the Google Ads API on behalf of `uid`:
 *   - accessToken: a valid OAuth token (owner's token for agency-managed clients).
 *   - customerId: the CLIENT's own assigned account (usuarios/{uid}.googleAdsCustomerId).
 *   - loginCustomerId: the manager (MCC) to send in the `login-customer-id` header,
 *     read from the doc that OWNS the token (the agency owner for managed clients,
 *     else the user themselves). Falls back to the GOOGLE_ADS_LOGIN_CUSTOMER_ID env
 *     var so existing env-based setups keep working until users re-pick an account.
 *
 * Mirrors the agency-managed resolution in getValidAccessToken: a managed client
 * (usuarios/{uid}.googleAdsManagedByAgency === true) reads its loginCustomerId from
 * the agency owner's doc (usuarios/{uid}.agencyId → agencias/{agencyId}.uid → owner).
 */
export async function getGoogleAdsContext(uid: string): Promise<{ accessToken: string; customerId: string; loginCustomerId: string }> {
  const db = getAdminDb();

  const userSnap = await db.collection("usuarios").doc(uid).get();
  if (!userSnap.exists) throw new Error("Usuario no encontrado en Firestore.");
  const userData = userSnap.data()!;

  // customerId + loginCustomerId are properties of THIS user's account assignment:
  // set on pick (self-serve) or by the agency in assign-google-ads (managed client).
  // The TOKEN is resolved separately below — getValidAccessToken already swaps to the
  // agency owner's token for managed clients, so login-customer-id stays per-user here.
  const customerId = String(userData.googleAdsCustomerId ?? "").trim();
  if (!/^\d+$/.test(customerId)) {
    throw new Error("No hay Customer ID de Google Ads configurado.");
  }

  const accessToken = await getValidAccessToken(uid);

  // login-customer-id must be digits only (the UI shows the MCC with dashes).
  // The env fallback applies ONLY to legacy docs that never saved the field: an
  // explicit "" means the picker chose direct mode (no MCC), and a global MCC the
  // connected Google doesn't belong to would turn every call into USER_PERMISSION_DENIED.
  const rawLoginCustomerId = userData.googleAdsLoginCustomerId;
  const loginCustomerId =
    rawLoginCustomerId !== undefined && rawLoginCustomerId !== null
      ? String(rawLoginCustomerId).replace(/\D/g, "")
      : (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, "") || "");

  return { accessToken, customerId, loginCustomerId };
}

// ── Core API Helpers ──────────────────────────────────────────────────

interface SearchResponse<T> {
  results?: T[];
  totalResultsCount?: string;
}

/** Extrae el errorCode específico de Google Ads (p.ej. USER_PERMISSION_DENIED,
 *  DEVELOPER_TOKEN_NOT_APPROVED, CUSTOMER_NOT_ENABLED) y el mensaje detallado de la
 *  estructura GoogleAdsFailure — mucho más útil para diagnosticar que el genérico
 *  "The caller does not have permission". */
function describeGoogleAdsError(text: string): { code?: string; message?: string } {
  try {
    const parsed = JSON.parse(text) as {
      error?: {
        message?: string;
        details?: Array<{ errors?: Array<{
          errorCode?: Record<string, unknown>;
          message?: string;
          location?: { fieldPathElements?: Array<{ fieldName?: string; index?: number }> };
        }> }>;
      };
    };
    const detail = parsed.error?.details?.find((d) => Array.isArray(d.errors) && d.errors.length);
    const first = detail?.errors?.[0];
    const code = first?.errorCode ? String(Object.values(first.errorCode)[0]) : undefined;
    // El campo exacto que falló (clave en errores REQUIRED, cuyo message genérico
    // "The required field was not present" no dice cuál es).
    const fieldPath = first?.location?.fieldPathElements
      ?.map((p) => `${p.fieldName ?? "?"}${p.index !== undefined ? `[${p.index}]` : ""}`)
      .join(".");
    const message = first?.message || parsed.error?.message;
    return { code, message: fieldPath ? `${message} — campo: ${fieldPath}` : message };
  } catch {
    return {};
  }
}

async function gaqlSearch<T>(
  customerId: string,
  auth: GoogleAdsAuth,
  query: string
): Promise<T[]> {
  const { developerToken } = getEnv();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let res: Response;
  try {
    res = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${auth.accessToken}`,
          "developer-token": developerToken,
          "login-customer-id": auth.loginCustomerId || customerId,
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
    const { code, message } = describeGoogleAdsError(text);
    const lc = auth.loginCustomerId || customerId;
    throw new Error(
      `Google Ads API HTTP ${res.status}${code ? ` [${code}]` : ""}: ${message || text.slice(0, 300)} (customer ${customerId}, login-customer-id ${lc})`
    );
  }

  const data = await res.json() as SearchResponse<T>;
  return data.results ?? [];
}

async function gaqlMutate<T>(
  customerId: string,
  auth: GoogleAdsAuth,
  resource: string,
  operations: unknown[]
): Promise<T> {
  const { developerToken } = getEnv();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let res: Response;
  try {
    res = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}/${resource}:mutate`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${auth.accessToken}`,
          "developer-token": developerToken,
          "login-customer-id": auth.loginCustomerId || customerId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ operations }),
        signal: controller.signal,
      }
    );
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Google Ads mutate ${resource} timeout (20s)`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "(sin cuerpo)");
    const { code, message } = describeGoogleAdsError(text);
    const lc = auth.loginCustomerId || customerId;
    throw new Error(
      `Google Ads mutate ${resource} HTTP ${res.status}${code ? ` [${code}]` : ""}: ${message || text.slice(0, 300)} (customer ${customerId}, login-customer-id ${lc})`
    );
  }

  return res.json() as Promise<T>;
}

// Endpoint general googleAds:mutate — acepta operaciones de VARIOS recursos en
// UNA petición atómica. Performance Max lo exige: el AssetGroup y sus assets
// mínimos deben crearse en el mismo request (y los temp resource names con id
// negativo solo se resuelven dentro de una misma petición).
async function googleAdsBulkMutate<T>(
  customerId: string,
  auth: GoogleAdsAuth,
  mutateOperations: unknown[]
): Promise<T> {
  const { developerToken } = getEnv();

  const controller = new AbortController();
  // Más margen que gaqlMutate: el payload lleva imágenes en base64.
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let res: Response;
  try {
    res = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:mutate`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${auth.accessToken}`,
          "developer-token": developerToken,
          "login-customer-id": auth.loginCustomerId || customerId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mutateOperations }),
        signal: controller.signal,
      }
    );
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Google Ads bulk mutate timeout (60s)");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "(sin cuerpo)");
    const { code, message } = describeGoogleAdsError(text);
    const lc = auth.loginCustomerId || customerId;
    throw new Error(
      `Google Ads bulk mutate HTTP ${res.status}${code ? ` [${code}]` : ""}: ${message || text.slice(0, 300)} (customer ${customerId}, login-customer-id ${lc})`
    );
  }

  return res.json() as Promise<T>;
}

// ── Read Functions ────────────────────────────────────────────────────

export async function getAccountInfo(
  customerId: string,
  auth: GoogleAdsAuth
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
    auth,
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
  auth: GoogleAdsAuth
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
    auth,
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
  auth: GoogleAdsAuth,
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
    auth,
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
  auth: GoogleAdsAuth,
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
    auth,
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
  auth: GoogleAdsAuth,
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
    auth,
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
  auth: GoogleAdsAuth,
  dateRange: string,
  custom?: DateRangeCustom
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

  const dateCond = dateWhere(dateRange, custom);

  const rows = await gaqlSearch<Row>(
    customerId,
    auth,
    `SELECT campaign.id, campaign.name,
            metrics.cost_micros, metrics.clicks, metrics.impressions,
            metrics.ctr, metrics.average_cpc, metrics.conversions,
            metrics.cost_per_conversion, segments.date
     FROM campaign
     WHERE ${dateCond}
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
  auth: GoogleAdsAuth
): Promise<GoogleAdsAccountBudget | null> {
  type Row = {
    accountBudget: {
      amountServedMicros: string;
      status: string;
    };
  };

  const rows = await gaqlSearch<Row>(
    customerId,
    auth,
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
  accessToken: string,
  loginCustomerId: string
): Promise<GoogleAdsCustomer[]> {
  const { developerToken } = getEnv();

  // Step 1: Get resource names list
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
    "developer-token": developerToken,
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

  const listRes = await fetch(
    `${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`,
    { headers }
  );

  if (!listRes.ok) {
    const text = await listRes.text().catch(() => "");
    throw new Error(`listAccessibleCustomers HTTP ${listRes.status}: ${text.slice(0, 500)}`);
  }

  const { resourceNames } = await listRes.json() as { resourceNames?: string[] };
  if (!resourceNames?.length) return [];

  // Step 2a — MCC mode: list the sub-accounts managed by the manager account.
  if (loginCustomerId) {
    type Row = {
      customerClient: { id: string; descriptiveName: string; currencyCode: string; timeZone: string; status: string };
    };
    const rows = await gaqlSearch<Row>(
      loginCustomerId,
      { accessToken, loginCustomerId },
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
      loginCustomerId,
    }));
  }

  // Step 2b — discover/self-serve mode (no MCC passed): the accessible customers
  // ARE the user's own accounts; fetch each account's details directly, querying
  // each account as itself (login-customer-id = its own id). We also detect which
  // account is a manager (MCC) so non-manager accounts can be addressed THROUGH it.
  type CustRow = {
    customer: { id: string; descriptiveName: string; currencyCode: string; timeZone: string; status: string; manager: boolean };
  };
  const discovered: Array<{ c: CustRow["customer"]; isManager: boolean }> = [];
  for (const rn of resourceNames) {
    const id = rn.split("/").pop() || "";
    if (!id) continue;
    try {
      const rows = await gaqlSearch<CustRow>(
        id,
        { accessToken, loginCustomerId: id },
        `SELECT customer.descriptive_name, customer.manager
         FROM customer LIMIT 1`
      );
      const c = rows[0]?.customer;
      if (c) discovered.push({ c: { ...c, id }, isManager: c.manager === true });
    } catch { /* skip accounts we can't read (CUSTOMER_NOT_ENABLED, etc.) */ }
  }

  const mccId = discovered.find((d) => d.isManager)?.c.id || "";
  return discovered.map(({ c, isManager }) => ({
    id: c.id,
    name: c.descriptiveName,
    currencyCode: c.currencyCode,
    timeZone: c.timeZone,
    status: c.status,
    loginCustomerId: isManager ? "" : (mccId || ""),
  }));
}

// ── Diagnóstico de acceso (para depurar 403 USER_PERMISSION_DENIED) ──────
// Revela QUÉ cuentas puede ver el Google conectado y CUÁL es manager (MCC),
// sin depender del login-customer-id global (que puede estar mal configurado).
export async function diagnoseAccess(accessToken: string): Promise<{
  envLoginCustomerId: string;
  accounts: { id: string; name?: string; isManager?: boolean; note?: string }[];
}> {
  const { developerToken, loginCustomerId } = getEnv();
  // listAccessibleCustomers depende SOLO del token OAuth (sin login-customer-id).
  const listRes = await fetch(`${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`, {
    headers: { "Authorization": `Bearer ${accessToken}`, "developer-token": developerToken },
  });
  if (!listRes.ok) {
    const t = await listRes.text().catch(() => "");
    throw new Error(`listAccessibleCustomers HTTP ${listRes.status}: ${t.slice(0, 200)}`);
  }
  const { resourceNames } = await listRes.json() as { resourceNames?: string[] };
  const ids = (resourceNames ?? []).map((rn) => rn.split("/").pop() || "").filter(Boolean);
  const accounts: { id: string; name?: string; isManager?: boolean; note?: string }[] = [];
  for (const id of ids.slice(0, 20)) {
    try {
      // Consulta cada cuenta como ella misma (login-customer-id = su propio id).
      const r = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${id}/googleAds:search`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "login-customer-id": id,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "SELECT customer.descriptive_name, customer.manager FROM customer LIMIT 1" }),
      });
      if (!r.ok) {
        const { code } = describeGoogleAdsError(await r.text().catch(() => ""));
        accounts.push({ id, note: code || `HTTP ${r.status}` });
        continue;
      }
      const d = await r.json() as { results?: { customer?: { descriptiveName?: string; manager?: boolean } }[] };
      const c = d.results?.[0]?.customer;
      accounts.push({ id, name: c?.descriptiveName, isManager: c?.manager });
    } catch {
      accounts.push({ id, note: "no accesible directamente" });
    }
  }
  return { envLoginCustomerId: loginCustomerId || "(no configurada)", accounts };
}

// ── Conversiones (acción de conversión + etiqueta de Google) ────────────
// El "píxel" de Google Ads: una acción de conversión WEBPAGE cuyo tag_snippet
// (gtag) se instala en el sitio Indexa del cliente. Cada clic al botón de
// WhatsApp del sitio dispara gtag('event','conversion') → Google lo atribuye
// al anuncio y habilita puja por conversiones.

const INDEXA_CONVERSION_NAME = "Lead WhatsApp (Indexa)";

export interface ConversionSetup {
  resourceName: string;
  name: string;
  status: string;
  awId: string; // "AW-1234567890" — id de la etiqueta de Google
  label: string; // label del evento de conversión (send_to = awId/label)
}

/** Extrae "AW-XXXX" y el label desde el event_snippet de Google
 *  (formato: gtag('event','conversion',{'send_to':'AW-123/AbC-dEf'})). */
function parseSendTo(snippet: string): { awId: string; label: string } | null {
  const m = snippet.match(/AW-(\d+)\/([\w-]+)/);
  return m ? { awId: `AW-${m[1]}`, label: m[2] } : null;
}

export async function getConversionSetup(
  customerId: string,
  auth: GoogleAdsAuth
): Promise<ConversionSetup | null> {
  type Row = {
    conversionAction: {
      resourceName: string; name: string; status: string;
      tagSnippets?: Array<{ type?: string; pageFormat?: string; eventSnippet?: string }>;
    };
  };
  const rows = await gaqlSearch<Row>(customerId, auth,
    `SELECT conversion_action.resource_name, conversion_action.name,
            conversion_action.status, conversion_action.tag_snippets
     FROM conversion_action
     WHERE conversion_action.name = '${INDEXA_CONVERSION_NAME}'
       AND conversion_action.status != 'REMOVED'
     LIMIT 1`);
  const ca = rows[0]?.conversionAction;
  if (!ca) return null;
  const snippet = (ca.tagSnippets ?? []).find(
    (s) => s.type === "WEBPAGE" && s.pageFormat === "HTML" && s.eventSnippet
  )?.eventSnippet;
  const parsed = snippet ? parseSendTo(snippet) : null;
  if (!parsed) return null;
  return { resourceName: ca.resourceName, name: ca.name, status: ca.status, ...parsed };
}

/** Crea (o reutiliza) la acción de conversión de Indexa y devuelve awId+label
 *  listos para instalar la etiqueta en el sitio. Idempotente. */
export async function createConversionSetup(
  customerId: string,
  auth: GoogleAdsAuth
): Promise<ConversionSetup & { created: boolean }> {
  const existing = await getConversionSetup(customerId, auth);
  if (existing) return { ...existing, created: false };

  await gaqlMutate(customerId, auth, "conversionActions", [{
    create: {
      name: INDEXA_CONVERSION_NAME,
      type: "WEBPAGE",
      category: "CONTACT",
      status: "ENABLED",
      countingType: "ONE_PER_CLICK", // leads: un clic de anuncio = máx 1 conversión
    },
  }]);

  const created = await getConversionSetup(customerId, auth);
  if (!created) {
    throw new Error("La acción de conversión se creó pero Google no devolvió su etiqueta (tag_snippets).");
  }
  return { ...created, created: true };
}

// ── Write Functions ───────────────────────────────────────────────────

export async function updateCampaignStatus(
  customerId: string,
  auth: GoogleAdsAuth,
  campaignResourceName: string,
  status: "ENABLED" | "PAUSED" | "REMOVED"
): Promise<void> {
  await gaqlMutate(customerId, auth, "campaigns", [
    {
      updateMask: "status",
      update: { resourceName: campaignResourceName, status },
    },
  ]);
}

/**
 * Cambia el estado de keywords INDIVIDUALES (ad_group_criterion) en lote.
 * Los resource names vienen de listKeywords (formato
 * customers/{cid}/adGroupCriteria/{adGroupId}~{criterionId}).
 * Devuelve cuántas keywords se actualizaron.
 */
export async function updateKeywordStatus(
  customerId: string,
  auth: GoogleAdsAuth,
  keywordResourceNames: string[],
  status: "ENABLED" | "PAUSED"
): Promise<number> {
  const ops = (keywordResourceNames || [])
    .filter((rn) => typeof rn === "string" && rn.includes("/adGroupCriteria/"))
    .map((rn) => ({
      updateMask: "status",
      update: { resourceName: rn, status },
    }));
  if (!ops.length) return 0;
  await gaqlMutate(customerId, auth, "adGroupCriteria", ops);
  return ops.length;
}

export async function updateCampaignBudget(
  customerId: string,
  auth: GoogleAdsAuth,
  budgetResourceName: string,
  amountMicros: number
): Promise<void> {
  await gaqlMutate(customerId, auth, "campaignBudgets", [
    {
      updateMask: "amountMicros",
      update: { resourceName: budgetResourceName, amountMicros: String(amountMicros) },
    },
  ]);
}

export async function createFullCampaign(
  customerId: string,
  auth: GoogleAdsAuth,
  params: CreateCampaignParams
): Promise<CreateCampaignResult> {
  type MutateResponse = {
    results: Array<{ resourceName: string }>;
  };

  // 1. Create budget
  const budgetRes = await gaqlMutate<MutateResponse>(
    customerId, auth, "campaignBudgets",
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
    // Obligatorios al crear una campaña (la API responde [REQUIRED] sin ellos):
    // - estrategia de puja: targetSpend = Maximizar clics por defecto, la única
    //   automática que funciona sin tracking de conversiones configurado.
    // - declaración TTPA de anuncios políticos UE (v20+): nuestras campañas son
    //   locales MX/USA, nunca publicidad política dirigida a la UE.
    ...(params.biddingStrategy === "MAXIMIZE_CONVERSIONS"
      ? { maximizeConversions: {} }
      : { targetSpend: {} }),
    containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    networkSettings: {
      targetGoogleSearch: true,
      targetSearchNetwork: true,
      targetContentNetwork: false,
    },
  };
  if (params.endDate) campaignPayload.endDate = params.endDate;

  const campaignRes = await gaqlMutate<MutateResponse>(
    customerId, auth, "campaigns",
    [{ create: campaignPayload }]
  );
  const campaignResourceName = campaignRes.results[0].resourceName;
  const campaignId = extractId(campaignResourceName);

  // 3. Create ad group
  const adGroupRes = await gaqlMutate<MutateResponse>(
    customerId, auth, "adGroups",
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
  await gaqlMutate(customerId, auth, "adGroupCriteria", keywordOps);

  // 5. Create responsive search ad (max 15 headlines, 4 descriptions)
  const headlines = params.adHeadlines.slice(0, 15).map((text) => ({ text }));
  const descriptions = params.adDescriptions.slice(0, 4).map((text) => ({ text }));

  const adRes = await gaqlMutate<MutateResponse>(
    customerId, auth, "adGroupAds",
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

  return { campaignId, budgetId, adGroupId, adId, keywordCount: params.keywords.length, campaignResourceName };
}

/**
 * Crea una campaña Performance Max COMPLETA (presupuesto + campaña + asset group
 * con textos e imágenes) en UNA petición atómica, como exige Google: el asset
 * group debe nacer con sus assets mínimos en el mismo bulk mutate.
 * La campaña queda PAUSED; puja maximizeConversions (PMax vive de conversiones —
 * valida antes que la cuenta tenga medición con getConversionSetup).
 */
export async function createPerformanceMaxCampaign(
  customerId: string,
  auth: GoogleAdsAuth,
  params: CreatePmaxParams
): Promise<CreatePmaxResult> {
  // Saneo a los límites de Google (recorta en vez de fallar por 1 carácter).
  const headlines = params.headlines.map((t) => t.trim().slice(0, 30)).filter(Boolean).slice(0, 5);
  if (headlines.length < 3) throw new Error("Performance Max necesita al menos 3 títulos (≤30 caracteres).");
  const descriptions = params.descriptions
    .map((t, i) => t.trim().slice(0, i === 0 ? 60 : 90))
    .filter(Boolean)
    .slice(0, 5);
  if (descriptions.length < 2) throw new Error("Performance Max necesita al menos 2 descripciones (la primera ≤60 caracteres).");
  const longHeadline = params.longHeadline.trim().slice(0, 90);
  const businessName = params.businessName.trim().slice(0, 25);
  if (!longHeadline || !businessName) throw new Error("Faltan long_headline o business_name.");

  const rn = (kind: string, id: number) => `customers/${customerId}/${kind}/${id}`;
  const ops: unknown[] = [];
  let tempId = 0;

  const budgetRn = rn("campaignBudgets", --tempId);
  ops.push({
    campaignBudgetOperation: {
      create: {
        resourceName: budgetRn,
        name: `${params.campaignName} - Budget`,
        amountMicros: String(params.dailyBudgetMicros),
        deliveryMethod: "STANDARD",
        explicitlyShared: false, // PMax exige presupuesto NO compartido
      },
    },
  });

  const campaignRn = rn("campaigns", --tempId);
  ops.push({
    campaignOperation: {
      create: {
        resourceName: campaignRn,
        name: params.campaignName,
        advertisingChannelType: "PERFORMANCE_MAX",
        status: "PAUSED",
        campaignBudget: budgetRn,
        maximizeConversions: {},
        containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        // Google activa Brand Guidelines en las PMax nuevas: el business name y
        // el logo se vinculan a NIVEL CAMPAÑA (CampaignAsset), ya no en el asset
        // group — sin ellos ahí: [REQUIRED_BUSINESS_NAME_ASSET_NOT_LINKED].
        brandGuidelinesEnabled: true,
      },
    },
  });

  const textAsset = (text: string): string => {
    const r = rn("assets", --tempId);
    ops.push({ assetOperation: { create: { resourceName: r, textAsset: { text } } } });
    return r;
  };
  // Los assets de imagen requieren nombre único; el timestamp evita chocar con
  // assets de intentos anteriores (los assets no se borran al fallar la campaña).
  const stamp = Date.now();
  const imageAsset = (label: string, dataB64: string): string => {
    const r = rn("assets", --tempId);
    ops.push({
      assetOperation: {
        create: { resourceName: r, name: `${params.campaignName} ${label} ${stamp}`, imageAsset: { data: dataB64 } },
      },
    });
    return r;
  };

  const headlineRns = headlines.map(textAsset);
  const longHeadlineRn = textAsset(longHeadline);
  const descriptionRns = descriptions.map(textAsset);
  const businessNameRn = textAsset(businessName);
  const marketingRn = imageAsset("marketing", params.marketingImageB64);
  const squareRn = imageAsset("square", params.squareImageB64);
  const logoRn = imageAsset("logo", params.logoImageB64);

  const assetGroupRn = rn("assetGroups", --tempId);
  ops.push({
    assetGroupOperation: {
      create: {
        resourceName: assetGroupRn,
        campaign: campaignRn,
        name: `${params.campaignName} - Assets`,
        finalUrls: [params.finalUrl],
        status: "PAUSED",
      },
    },
  });

  const link = (asset: string, fieldType: string) =>
    ops.push({ assetGroupAssetOperation: { create: { assetGroup: assetGroupRn, asset, fieldType } } });
  headlineRns.forEach((r) => link(r, "HEADLINE"));
  link(longHeadlineRn, "LONG_HEADLINE");
  descriptionRns.forEach((r) => link(r, "DESCRIPTION"));
  link(marketingRn, "MARKETING_IMAGE");
  link(squareRn, "SQUARE_MARKETING_IMAGE");

  // Brand Guidelines: business name y logo van como assets DE LA CAMPAÑA.
  const linkCampaign = (asset: string, fieldType: string) =>
    ops.push({ campaignAssetOperation: { create: { campaign: campaignRn, asset, fieldType } } });
  linkCampaign(businessNameRn, "BUSINESS_NAME");
  linkCampaign(logoRn, "LOGO");

  type BulkResponse = { mutateOperationResponses?: Array<Record<string, { resourceName?: string } | undefined>> };
  const res = await googleAdsBulkMutate<BulkResponse>(customerId, auth, ops);
  const responses = res.mutateOperationResponses ?? [];
  const find = (key: string) => responses.find((r) => r[key]?.resourceName)?.[key]?.resourceName || "";

  const campaignResourceName = find("campaignResult");
  return {
    campaignId: extractId(campaignResourceName),
    budgetId: extractId(find("campaignBudgetResult")),
    assetGroupId: extractId(find("assetGroupResult")),
    campaignResourceName,
  };
}

// ── Extensiones / assets de campaña (Fase F) ─────────────────────────
// Callouts, snippets estructurados y teléfono: suben CTR sin costo extra.
// Se crean los assets y se vinculan a la campaña en un solo bulk mutate.

export interface CampaignExtensionsParams {
  callouts?: string[]; // 2-10 textos ≤25 chars
  snippetHeader?: string; // encabezado aprobado por Google en español, p.ej. "Servicios"
  snippetValues?: string[]; // ≥3 valores ≤25 chars
  phoneNumber?: string; // teléfono nacional (se limpian separadores y lada 52)
  countryCode?: string; // ISO-3166 alpha-2; default MX
}

export async function addCampaignExtensions(
  customerId: string,
  auth: GoogleAdsAuth,
  campaignResourceName: string,
  params: CampaignExtensionsParams
): Promise<{ callouts: number; snippet: boolean; call: boolean }> {
  const rn = (kind: string, id: number) => `customers/${customerId}/${kind}/${id}`;
  const ops: unknown[] = [];
  let tempId = 0;

  const link = (asset: string, fieldType: string) =>
    ops.push({ campaignAssetOperation: { create: { campaign: campaignResourceName, asset, fieldType } } });

  const callouts = (params.callouts ?? []).map((t) => t.trim().slice(0, 25)).filter(Boolean).slice(0, 10);
  for (const text of callouts) {
    const r = rn("assets", --tempId);
    ops.push({ assetOperation: { create: { resourceName: r, calloutAsset: { calloutText: text } } } });
    link(r, "CALLOUT");
  }

  const snippetValues = (params.snippetValues ?? []).map((t) => t.trim().slice(0, 25)).filter(Boolean).slice(0, 10);
  const snippet = Boolean(params.snippetHeader && snippetValues.length >= 3);
  if (snippet) {
    const r = rn("assets", --tempId);
    ops.push({
      assetOperation: {
        create: { resourceName: r, structuredSnippetAsset: { header: params.snippetHeader, values: snippetValues } },
      },
    });
    link(r, "STRUCTURED_SNIPPET");
  }

  // Teléfono: Google espera número nacional + countryCode aparte.
  let call = false;
  if (params.phoneNumber) {
    let digits = params.phoneNumber.replace(/\D/g, "");
    const cc = (params.countryCode || "MX").toUpperCase();
    if (cc === "MX" && digits.length === 12 && digits.startsWith("52")) digits = digits.slice(2);
    if (cc === "US" && digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    if (digits.length >= 8) {
      const r = rn("assets", --tempId);
      ops.push({ assetOperation: { create: { resourceName: r, callAsset: { countryCode: cc, phoneNumber: digits } } } });
      link(r, "CALL");
      call = true;
    }
  }

  if (!ops.length) throw new Error("Sin extensiones que agregar: pasa callouts (2+), snippet (header + 3 valores) o teléfono.");
  await googleAdsBulkMutate(customerId, auth, ops);
  return { callouts: callouts.length, snippet, call };
}

// ── Remarketing: listas de usuarios (Fase C) ─────────────────────────
// La etiqueta de conversiones (Fase A) ya recolecta visitantes; estas listas
// los agrupan. Mínimos de Google para servir: ~100 usuarios (Display) /
// ~1,000 (Búsqueda) — se llenan solas con el tráfico del sitio.

const VISITORS_LIST_NAME = "Visitantes del sitio (Indexa)";
const CONVERTERS_LIST_NAME = "Convirtieron - Lead WhatsApp (Indexa)";

export interface UserListSummary {
  resourceName: string;
  name: string;
  type?: string;
  sizeForDisplay?: number;
  sizeForSearch?: number;
}

export async function listAudiences(customerId: string, auth: GoogleAdsAuth): Promise<UserListSummary[]> {
  type Row = { userList: { resourceName: string; name: string; type?: string; sizeForDisplay?: string; sizeForSearch?: string } };
  const rows = await gaqlSearch<Row>(customerId, auth,
    `SELECT user_list.resource_name, user_list.name, user_list.type,
            user_list.size_for_display, user_list.size_for_search
     FROM user_list
     ORDER BY user_list.id DESC
     LIMIT 50`);
  return rows.map((r) => ({
    resourceName: r.userList.resourceName,
    name: r.userList.name,
    type: r.userList.type,
    sizeForDisplay: Number(r.userList.sizeForDisplay ?? 0),
    sizeForSearch: Number(r.userList.sizeForSearch ?? 0),
  }));
}

async function findUserListByName(customerId: string, auth: GoogleAdsAuth, name: string): Promise<string | null> {
  type Row = { userList: { resourceName: string } };
  const rows = await gaqlSearch<Row>(customerId, auth,
    `SELECT user_list.resource_name FROM user_list WHERE user_list.name = '${name.replace(/'/g, "")}' LIMIT 1`);
  return rows[0]?.userList.resourceName ?? null;
}

export interface RemarketingListsResult {
  visitors: { resourceName: string; name: string; created: boolean };
  converters: { resourceName: string; name: string; created: boolean } | null;
}

/**
 * Crea (idempotente) las dos listas base de remarketing:
 *  - Visitantes del sitio: rule-based (url__ CONTAINS el path del sitio Indexa),
 *    con prepopulación de los últimos 30 días cuando Google puede.
 *  - Convirtieron: basic list ligada a la acción de conversión de Fase A (si existe).
 */
export async function createRemarketingLists(
  customerId: string,
  auth: GoogleAdsAuth,
  siteUrlFragment: string,
  conversionActionResourceName?: string
): Promise<RemarketingListsResult> {
  // Visitantes (rule-based)
  let visitorsRn = await findUserListByName(customerId, auth, VISITORS_LIST_NAME);
  let visitorsCreated = false;
  if (!visitorsRn) {
    type MutateResponse = { results: Array<{ resourceName: string }> };
    const res = await gaqlMutate<MutateResponse>(customerId, auth, "userLists", [{
      create: {
        name: VISITORS_LIST_NAME,
        description: "Visitantes del sitio Indexa (alimentada por la etiqueta de Google instalada por Indexa).",
        membershipStatus: "OPEN",
        membershipLifeSpan: "90",
        prepopulationStatus: "REQUESTED",
        flexibleRuleUserList: {
          inclusiveRuleOperator: "AND",
          inclusiveOperands: [{
            rule: {
              ruleItemGroups: [{
                ruleItems: [{
                  name: "url__",
                  stringRuleItem: { operator: "CONTAINS", value: siteUrlFragment },
                }],
              }],
            },
            lookbackWindowDays: "90",
          }],
          exclusiveOperands: [],
        },
      },
    }]);
    visitorsRn = res.results[0].resourceName;
    visitorsCreated = true;
  }

  // Convirtieron (basic list sobre la acción de conversión de Fase A)
  let converters: RemarketingListsResult["converters"] = null;
  if (conversionActionResourceName) {
    let convRn = await findUserListByName(customerId, auth, CONVERTERS_LIST_NAME);
    let convCreated = false;
    if (!convRn) {
      type MutateResponse = { results: Array<{ resourceName: string }> };
      const res = await gaqlMutate<MutateResponse>(customerId, auth, "userLists", [{
        create: {
          name: CONVERTERS_LIST_NAME,
          description: "Personas que ya convirtieron (clic a WhatsApp) — útil para excluir o recomprar.",
          membershipStatus: "OPEN",
          membershipLifeSpan: "180",
          basicUserList: { actions: [{ conversionAction: conversionActionResourceName }] },
        },
      }]);
      convRn = res.results[0].resourceName;
      convCreated = true;
    }
    converters = { resourceName: convRn, name: CONVERTERS_LIST_NAME, created: convCreated };
  }

  return {
    visitors: { resourceName: visitorsRn, name: VISITORS_LIST_NAME, created: visitorsCreated },
    converters,
  };
}

// ── Advanced Segment Queries ──────────────────────────────────────────

export async function getHourlyPerformance(customerId: string, auth: GoogleAdsAuth, dateRange: string, custom?: DateRangeCustom): Promise<GoogleAdsHourlyRow[]> {
  type Row = { segments: { hour: number; dayOfWeek: string }; metrics: { costMicros: string; clicks: string; impressions: string; conversions: string; ctr: string; averageCpc: string } };
  const dateCond = dateWhere(dateRange, custom);
  const rows = await gaqlSearch<Row>(customerId, auth,
    `SELECT segments.hour, segments.day_of_week, metrics.cost_micros, metrics.clicks,
            metrics.impressions, metrics.conversions, metrics.ctr, metrics.average_cpc
     FROM campaign
     WHERE ${dateCond} AND campaign.status != 'REMOVED'`);
  return rows.map((r) => ({
    hour: Number(r.segments.hour ?? 0), dayOfWeek: r.segments.dayOfWeek ?? "",
    cost: microsToUnit(r.metrics.costMicros ?? 0), clicks: Number(r.metrics.clicks ?? 0),
    impressions: Number(r.metrics.impressions ?? 0), conversions: Number(r.metrics.conversions ?? 0),
    ctr: Number(r.metrics.ctr ?? 0), avgCpc: microsToUnit(r.metrics.averageCpc ?? 0),
  }));
}

export async function getDevicePerformance(customerId: string, auth: GoogleAdsAuth, dateRange: string, custom?: DateRangeCustom): Promise<GoogleAdsDeviceRow[]> {
  type Row = { segments: { device: string }; metrics: { costMicros: string; clicks: string; impressions: string; conversions: string; ctr: string; averageCpc: string } };
  const dateCond = dateWhere(dateRange, custom);
  const rows = await gaqlSearch<Row>(customerId, auth,
    `SELECT segments.device, metrics.cost_micros, metrics.clicks, metrics.impressions,
            metrics.conversions, metrics.ctr, metrics.average_cpc
     FROM campaign
     WHERE ${dateCond} AND campaign.status != 'REMOVED'`);
  return rows.map((r) => ({
    device: r.segments.device ?? "UNKNOWN", cost: microsToUnit(r.metrics.costMicros ?? 0),
    clicks: Number(r.metrics.clicks ?? 0), impressions: Number(r.metrics.impressions ?? 0),
    conversions: Number(r.metrics.conversions ?? 0), ctr: Number(r.metrics.ctr ?? 0),
    avgCpc: microsToUnit(r.metrics.averageCpc ?? 0),
  }));
}

export async function getGeoPerformance(customerId: string, auth: GoogleAdsAuth, dateRange: string, custom?: DateRangeCustom): Promise<GoogleAdsGeoRow[]> {
  type Row = { segments?: { geoTargetRegion?: string; geoTargetCity?: string }; metrics: { costMicros: string; clicks: string; conversions: string } };
  const dateCond = dateWhere(dateRange, custom);
  const rows = await gaqlSearch<Row>(customerId, auth,
    `SELECT segments.geo_target_city, segments.geo_target_region,
            metrics.cost_micros, metrics.clicks, metrics.conversions
     FROM geographic_view
     WHERE ${dateCond}`).catch(() => [] as Row[]);
  const out = rows.map((r) => ({
    locationId: (r.segments?.geoTargetCity || r.segments?.geoTargetRegion || "").split("/").pop() || "",
    locationName: "", cost: microsToUnit(r.metrics.costMicros ?? 0),
    clicks: Number(r.metrics.clicks ?? 0), conversions: Number(r.metrics.conversions ?? 0),
  })).filter((x) => x.locationId);
  const top = [...out].sort((a, b) => b.cost - a.cost).slice(0, 25);
  const ids = [...new Set(top.map((x) => x.locationId))];
  if (ids.length) {
    type NameRow = { geoTargetConstant: { id: string; name: string } };
    const resourceNames = ids.map((id) => `'geoTargetConstants/${id}'`).join(",");
    const names = await gaqlSearch<NameRow>(customerId, auth,
      `SELECT geo_target_constant.id, geo_target_constant.name
       FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${resourceNames})`).catch(() => [] as NameRow[]);
    const map = new Map(names.map((n) => [String(n.geoTargetConstant.id), n.geoTargetConstant.name]));
    for (const r of out) r.locationName = map.get(r.locationId) || r.locationId;
  }
  return out.sort((a, b) => b.cost - a.cost);
}

export async function getAudiencePerformance(customerId: string, auth: GoogleAdsAuth, dateRange: string, custom?: DateRangeCustom): Promise<GoogleAdsAudienceRow[]> {
  type Row = { adGroupCriterion?: { type?: string; displayName?: string }; metrics: { costMicros: string; clicks: string; conversions: string } };
  const dateCond = dateWhere(dateRange, custom);
  const rows = await gaqlSearch<Row>(customerId, auth,
    `SELECT ad_group_criterion.type, ad_group_criterion.display_name,
            metrics.cost_micros, metrics.clicks, metrics.conversions
     FROM ad_group_audience_view
     WHERE ${dateCond}`).catch(() => [] as Row[]);
  return rows.map((r) => ({
    name: r.adGroupCriterion?.displayName || "(audiencia)", type: r.adGroupCriterion?.type || "",
    cost: microsToUnit(r.metrics.costMicros ?? 0), clicks: Number(r.metrics.clicks ?? 0),
    conversions: Number(r.metrics.conversions ?? 0),
  }));
}

export async function getExtensionPerformance(customerId: string, auth: GoogleAdsAuth, dateRange: string, custom?: DateRangeCustom): Promise<GoogleAdsExtensionRow[]> {
  type Row = { asset?: { id?: string; type?: string; name?: string }; metrics: { costMicros: string; clicks: string; impressions: string } };
  const dateCond = dateWhere(dateRange, custom);
  const rows = await gaqlSearch<Row>(customerId, auth,
    `SELECT asset.id, asset.type, asset.name, metrics.cost_micros, metrics.clicks, metrics.impressions
     FROM campaign_asset
     WHERE ${dateCond} AND campaign_asset.status != 'REMOVED'`).catch(() => [] as Row[]);
  return rows.map((r) => ({
    assetId: r.asset?.id || "", type: r.asset?.type || "", name: r.asset?.name || "",
    cost: microsToUnit(r.metrics.costMicros ?? 0), clicks: Number(r.metrics.clicks ?? 0),
    impressions: Number(r.metrics.impressions ?? 0),
  }));
}

// ── Write Helpers ─────────────────────────────────────────────────────

export async function activateCampaign(customerId: string, auth: GoogleAdsAuth, campaignResourceName: string): Promise<void> {
  const campaignId = extractId(campaignResourceName);
  type AdGroupRow = { adGroup: { resourceName: string } };
  type AdRow = { adGroupAd: { resourceName: string } };
  const adGroups = await gaqlSearch<AdGroupRow>(customerId, auth,
    `SELECT ad_group.resource_name FROM ad_group WHERE campaign.id = ${campaignId} AND ad_group.status = 'PAUSED'`);
  const ads = await gaqlSearch<AdRow>(customerId, auth,
    `SELECT ad_group_ad.resource_name FROM ad_group_ad WHERE campaign.id = ${campaignId} AND ad_group_ad.status = 'PAUSED'`);
  await gaqlMutate(customerId, auth, "campaigns",
    [{ updateMask: "status", update: { resourceName: campaignResourceName, status: "ENABLED" } }]);
  if (adGroups.length) await gaqlMutate(customerId, auth, "adGroups",
    adGroups.map((g) => ({ updateMask: "status", update: { resourceName: g.adGroup.resourceName, status: "ENABLED" } })));
  if (ads.length) await gaqlMutate(customerId, auth, "adGroupAds",
    ads.map((a) => ({ updateMask: "status", update: { resourceName: a.adGroupAd.resourceName, status: "ENABLED" } })));
}

export async function addNegativeKeywords(customerId: string, auth: GoogleAdsAuth, campaignResourceName: string, keywords: string[]): Promise<number> {
  const ops = keywords.filter((k) => k.trim()).map((text) => ({
    create: { campaign: campaignResourceName, negative: true, keyword: { text: text.trim(), matchType: "BROAD" } },
  }));
  if (!ops.length) return 0;
  await gaqlMutate(customerId, auth, "campaignCriteria", ops);
  return ops.length;
}

export async function addLocationTargeting(customerId: string, auth: GoogleAdsAuth, campaignResourceName: string, locationName: string, countryCode = "MX"): Promise<boolean> {
  if (!locationName?.trim()) return false;
  const name = locationName.trim().replace(/[\\'"]/g, "").slice(0, 80);

  // geoTargetConstants:suggest es el endpoint oficial para resolver nombres de
  // lugar: insensible a acentos y mayúsculas ("Querétaro" → "Queretaro", el
  // nombre canónico de Google). El match exacto por GAQL fallaba con acentos.
  const { developerToken } = getEnv();
  let geo = "";
  try {
    const res = await fetch(`${GOOGLE_ADS_API_BASE}/geoTargetConstants:suggest`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${auth.accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ locale: "es", countryCode, locationNames: { names: [name] } }),
    });
    if (res.ok) {
      const data = await res.json() as {
        geoTargetConstantSuggestions?: Array<{
          geoTargetConstant?: { resourceName?: string; targetType?: string; status?: string };
        }>;
      };
      const suggestions = (data.geoTargetConstantSuggestions ?? [])
        .map((s) => s.geoTargetConstant)
        .filter((g): g is { resourceName: string; targetType?: string; status?: string } => Boolean(g?.resourceName));
      // Preferimos ciudad (lo que piden las pymes); si no, el primer match.
      geo = (suggestions.find((g) => g.targetType === "City") ?? suggestions[0])?.resourceName ?? "";
    } else {
      console.error("[googleAds] geoTargetConstants:suggest HTTP", res.status, (await res.text().catch(() => "")).slice(0, 200));
    }
  } catch (e) {
    console.error("[googleAds] geoTargetConstants:suggest:", e instanceof Error ? e.message : e);
  }

  // Fallback: match exacto por GAQL (cubre nombres que ya vienen canónicos).
  if (!geo) {
    type GeoRow = { geoTargetConstant: { resourceName: string } };
    const matches = await gaqlSearch<GeoRow>(customerId, auth,
      `SELECT geo_target_constant.resource_name
       FROM geo_target_constant
       WHERE geo_target_constant.name = '${name}' AND geo_target_constant.status = 'ENABLED'
       LIMIT 5`).catch(() => [] as GeoRow[]);
    geo = matches[0]?.geoTargetConstant?.resourceName ?? "";
  }

  if (!geo) {
    console.warn(`[googleAds] sin geo target para "${name}" (country ${countryCode})`);
    return false;
  }
  await gaqlMutate(customerId, auth, "campaignCriteria",
    [{ create: { campaign: campaignResourceName, location: { geoTargetConstant: geo } } }]);
  return true;
}

// ── Bid Modifier Setters ──────────────────────────────────────────────

function clampBidModifier(m: number): number { return Math.min(3.0, Math.max(0.1, Number(m) || 1.0)); }

export async function setDeviceBidModifier(customerId: string, auth: GoogleAdsAuth, campaignResourceName: string, device: string, bidModifier: number): Promise<number> {
  const mod = clampBidModifier(bidModifier);
  const dev = device.toUpperCase();
  if (!["MOBILE", "DESKTOP", "TABLET"].includes(dev)) throw new Error("Dispositivo inválido (usa MOBILE/DESKTOP/TABLET).");
  const campaignId = extractId(campaignResourceName);
  type AgRow = { adGroup: { id: string; resourceName: string } };
  const adGroups = await gaqlSearch<AgRow>(customerId, auth,
    `SELECT ad_group.id, ad_group.resource_name FROM ad_group WHERE campaign.id = ${campaignId} AND ad_group.status != 'REMOVED'`);
  let applied = 0;
  for (const ag of adGroups) {
    type ExRow = { adGroupBidModifier: { resourceName: string } };
    const existing = await gaqlSearch<ExRow>(customerId, auth,
      `SELECT ad_group_bid_modifier.resource_name FROM ad_group_bid_modifier
       WHERE ad_group.id = ${ag.adGroup.id} AND ad_group_bid_modifier.device.type = '${dev}'`).catch(() => [] as ExRow[]);
    if (existing[0]) {
      await gaqlMutate(customerId, auth, "adGroupBidModifiers",
        [{ updateMask: "bidModifier", update: { resourceName: existing[0].adGroupBidModifier.resourceName, bidModifier: mod } }]);
    } else {
      await gaqlMutate(customerId, auth, "adGroupBidModifiers",
        [{ create: { adGroup: ag.adGroup.resourceName, device: { type: dev }, bidModifier: mod } }]);
    }
    applied++;
  }
  return applied;
}

export async function setAdScheduleBidModifier(customerId: string, auth: GoogleAdsAuth, campaignResourceName: string, schedule: { dayOfWeek: string; startHour: number; endHour: number }, bidModifier: number): Promise<void> {
  const mod = clampBidModifier(bidModifier);
  await gaqlMutate(customerId, auth, "campaignCriteria",
    [{ create: { campaign: campaignResourceName, bidModifier: mod,
        adSchedule: { dayOfWeek: schedule.dayOfWeek.toUpperCase(), startHour: schedule.startHour, startMinute: "ZERO", endHour: schedule.endHour, endMinute: "ZERO" } } }]);
}

export async function setLocationBidModifier(customerId: string, auth: GoogleAdsAuth, campaignResourceName: string, locationName: string, bidModifier: number): Promise<void> {
  const mod = clampBidModifier(bidModifier);
  const campaignId = extractId(campaignResourceName);
  const name = locationName.trim().replace(/[\\'"]/g, "").slice(0, 80); // strip quotes/backslashes (GAQL injection guard)
  type GeoRow = { geoTargetConstant: { resourceName: string } };
  const geo = (await gaqlSearch<GeoRow>(customerId, auth,
    `SELECT geo_target_constant.resource_name FROM geo_target_constant WHERE geo_target_constant.name = '${name}' AND geo_target_constant.status = 'ENABLED' LIMIT 1`).catch(() => [] as GeoRow[]))[0]?.geoTargetConstant?.resourceName;
  type CritRow = { campaignCriterion: { resourceName: string; location?: { geoTargetConstant?: string } } };
  const crits = await gaqlSearch<CritRow>(customerId, auth,
    `SELECT campaign_criterion.resource_name, campaign_criterion.location.geo_target_constant
     FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.type = 'LOCATION'`).catch(() => [] as CritRow[]);
  const match = crits.find((c) => geo && c.campaignCriterion.location?.geoTargetConstant === geo) || crits[0];
  if (match) {
    await gaqlMutate(customerId, auth, "campaignCriteria",
      [{ updateMask: "bidModifier", update: { resourceName: match.campaignCriterion.resourceName, bidModifier: mod } }]);
  } else if (geo) {
    await gaqlMutate(customerId, auth, "campaignCriteria",
      [{ create: { campaign: campaignResourceName, location: { geoTargetConstant: geo }, bidModifier: mod } }]);
  } else {
    throw new Error("No se encontró la ubicación para aplicar el modificador.");
  }
}

export async function getKeywordPerformance(customerId: string, auth: GoogleAdsAuth, dateRange: string, custom?: DateRangeCustom): Promise<GoogleAdsKeywordPerfRow[]> {
  type Row = {
    adGroupCriterion: {
      criterionId: string;
      keyword?: { text?: string; matchType?: string };
    };
    campaign: { id: string; name: string };
    metrics: {
      costMicros: string; clicks: string; impressions: string;
      ctr: string; averageCpc: string; conversions: string; costPerConversion: string;
    };
  };
  const dateCond = dateWhere(dateRange, custom);
  const rows = await gaqlSearch<Row>(customerId, auth,
    `SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type, campaign.id, campaign.name,
            metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.ctr,
            metrics.average_cpc, metrics.conversions, metrics.cost_per_conversion
     FROM keyword_view
     WHERE ${dateCond}
       AND ad_group_criterion.status != 'REMOVED'
     ORDER BY metrics.cost_micros DESC
     LIMIT 500`).catch(() => [] as Row[]);
  return rows.map((r) => ({
    keywordId: r.adGroupCriterion.criterionId,
    text: r.adGroupCriterion.keyword?.text ?? "",
    matchType: r.adGroupCriterion.keyword?.matchType ?? "",
    campaignId: r.campaign.id,
    campaignName: r.campaign.name,
    cost: microsToUnit(r.metrics.costMicros ?? 0),
    clicks: Number(r.metrics.clicks ?? 0),
    impressions: Number(r.metrics.impressions ?? 0),
    ctr: Number(r.metrics.ctr ?? 0),
    avgCpc: microsToUnit(r.metrics.averageCpc ?? 0),
    conversions: Number(r.metrics.conversions ?? 0),
    costPerConversion: microsToUnit(r.metrics.costPerConversion ?? 0),
  }));
}

export async function getSearchTerms(customerId: string, auth: GoogleAdsAuth, dateRange: string, custom?: DateRangeCustom): Promise<GoogleAdsSearchTermRow[]> {
  type Row = {
    searchTermView: { searchTerm?: string; status?: string };
    campaign?: { name?: string };
    metrics: {
      costMicros: string; clicks: string; impressions: string;
      ctr: string; conversions: string; costPerConversion: string;
    };
  };
  const dateCond = dateWhere(dateRange, custom);
  const rows = await gaqlSearch<Row>(customerId, auth,
    `SELECT search_term_view.search_term, search_term_view.status, campaign.name,
            metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.ctr,
            metrics.conversions, metrics.cost_per_conversion
     FROM search_term_view
     WHERE ${dateCond}
     ORDER BY metrics.cost_micros DESC
     LIMIT 200`).catch(() => [] as Row[]);
  return rows.map((r) => ({
    term: r.searchTermView?.searchTerm ?? "",
    status: r.searchTermView?.status ?? "",
    campaignName: r.campaign?.name ?? "",
    cost: microsToUnit(r.metrics.costMicros ?? 0),
    clicks: Number(r.metrics.clicks ?? 0),
    impressions: Number(r.metrics.impressions ?? 0),
    ctr: Number(r.metrics.ctr ?? 0),
    conversions: Number(r.metrics.conversions ?? 0),
    costPerConversion: microsToUnit(r.metrics.costPerConversion ?? 0),
  }));
}
