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
