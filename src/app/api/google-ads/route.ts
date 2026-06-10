import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verifyAuth";
import { createRateLimiter } from "@/lib/rateLimit";
import {
  getGoogleAdsContext,
  getCampaigns,
  getAdGroups,
  getAds,
  getKeywords,
  getReporting,
  getAccountInfo,
  getAccountBudget,
  updateCampaignStatus,
  updateCampaignBudget,
  createFullCampaign,
  getHourlyPerformance,
  getDevicePerformance,
  getGeoPerformance,
  getAudiencePerformance,
  getExtensionPerformance,
  getKeywordPerformance,
  getSearchTerms,
  activateCampaign,
  addNegativeKeywords,
  setDeviceBidModifier,
  setAdScheduleBidModifier,
  setLocationBidModifier,
} from "@/lib/googleAdsClient";

export const maxDuration = 60;

const limiter = createRateLimiter({ windowMs: 60_000, max: 20 });
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

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
  const rawCampaignId = searchParams.get("campaignId");
  if (rawCampaignId !== null && !/^\d+$/.test(rawCampaignId)) {
    return NextResponse.json({ error: "campaignId inválido." }, { status: 400 });
  }
  const campaignId = rawCampaignId ?? undefined;
  const dateRange = searchParams.get("dateRange") || "LAST_7_DAYS";
  const rawStart = searchParams.get("startDate");
  const rawEnd = searchParams.get("endDate");
  let custom: { startDate: string; endDate: string } | undefined;
  if (dateRange === "CUSTOM") {
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    if (!rawStart || !rawEnd || !ISO.test(rawStart) || !ISO.test(rawEnd)) {
      return NextResponse.json({ error: "Rango de fechas inválido." }, { status: 400 });
    }
    const todayIso = new Date().toISOString().split("T")[0];
    if (rawStart > rawEnd) {
      return NextResponse.json({ error: "La fecha inicial no puede ser posterior a la final." }, { status: 400 });
    }
    if (rawEnd > todayIso) {
      return NextResponse.json({ error: "La fecha final no puede ser futura." }, { status: 400 });
    }
    custom = { startDate: rawStart, endDate: rawEnd };
  }

  try {
    const { accessToken, customerId, loginCustomerId } = await getGoogleAdsContext(user.uid);
    const auth = { accessToken, loginCustomerId };

    switch (action) {
      case "campaigns": {
        const campaigns = await getCampaigns(customerId, auth);
        return NextResponse.json({ campaigns });
      }
      case "ad_groups": {
        const adGroups = await getAdGroups(customerId, auth, campaignId);
        return NextResponse.json({ adGroups });
      }
      case "ads": {
        const ads = await getAds(customerId, auth, campaignId);
        return NextResponse.json({ ads });
      }
      case "keywords": {
        const keywords = await getKeywords(customerId, auth, campaignId);
        return NextResponse.json({ keywords });
      }
      case "reporting": {
        const rows = await getReporting(customerId, auth, dateRange, custom);
        return NextResponse.json({ rows });
      }
      case "account_info": {
        const info = await getAccountInfo(customerId, auth);
        return NextResponse.json({ info });
      }
      case "account_budget": {
        const budget = await getAccountBudget(customerId, auth);
        return NextResponse.json({ budget });
      }
      case "hourly":
        return NextResponse.json({ rows: await getHourlyPerformance(customerId, auth, dateRange, custom) });
      case "device":
        return NextResponse.json({ rows: await getDevicePerformance(customerId, auth, dateRange, custom) });
      case "geo":
        return NextResponse.json({ rows: await getGeoPerformance(customerId, auth, dateRange, custom) });
      case "audiences":
        return NextResponse.json({ rows: await getAudiencePerformance(customerId, auth, dateRange, custom) });
      case "extensions":
        return NextResponse.json({ rows: await getExtensionPerformance(customerId, auth, dateRange, custom) });
      case "keyword_performance":
        return NextResponse.json({ rows: await getKeywordPerformance(customerId, auth, dateRange, custom) });
      case "search_terms":
        return NextResponse.json({ rows: await getSearchTerms(customerId, auth, dateRange, custom) });
      default:
        return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido.";
    console.error(`[google-ads GET action=${action}]`, msg);
    const isNotFound = msg.includes("No hay");
    // msg es seguro para el cliente: describeGoogleAdsError arma [errorCode] +
    // customer + login-customer-id, nunca tokens.
    return NextResponse.json({ error: msg }, { status: isNotFound ? 404 : 502 });
  }
}

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
    const { accessToken, customerId, loginCustomerId } = await getGoogleAdsContext(user.uid);
    const auth = { accessToken, loginCustomerId };

    if (action === "pause" || action === "enable" || action === "remove") {
      const { campaignResourceName } = body as { campaignResourceName?: string };
      if (!campaignResourceName) {
        return NextResponse.json({ error: "Falta campaignResourceName." }, { status: 400 });
      }
      const statusMap = { pause: "PAUSED", enable: "ENABLED", remove: "REMOVED" } as const;
      await updateCampaignStatus(customerId, auth, campaignResourceName, statusMap[action as keyof typeof statusMap]);
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
      await updateCampaignBudget(customerId, auth, budgetResourceName, amountMicros);
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

      const result = await createFullCampaign(customerId, auth, {
        campaignName, dailyBudgetMicros, startDate, endDate,
        targetCountry: targetCountry ?? "MX",
        adGroupName, keywords, adHeadlines, adDescriptions, finalUrl,
      });

      return NextResponse.json({ success: true, ...result });
    }

    if (action === "activate") {
      const { campaignResourceName } = body as { campaignResourceName?: string };
      if (!campaignResourceName) return NextResponse.json({ error: "Falta campaignResourceName." }, { status: 400 });
      await activateCampaign(customerId, auth, campaignResourceName);
      return NextResponse.json({ success: true });
    }

    if (action === "add_negative_keywords") {
      const { campaignResourceName, keywords } = body as { campaignResourceName?: string; keywords?: string[] };
      if (!campaignResourceName || !keywords?.length) return NextResponse.json({ error: "Faltan campaignResourceName o keywords." }, { status: 400 });
      const added = await addNegativeKeywords(customerId, auth, campaignResourceName, keywords);
      return NextResponse.json({ success: true, added });
    }

    if (action === "set_device_bid_modifier") {
      const { campaignResourceName, device, bidModifier } = body as { campaignResourceName?: string; device?: string; bidModifier?: number };
      if (!campaignResourceName || !device || bidModifier === undefined) return NextResponse.json({ error: "Faltan parámetros." }, { status: 400 });
      const applied = await setDeviceBidModifier(customerId, auth, campaignResourceName, device, bidModifier);
      return NextResponse.json({ success: true, applied });
    }
    if (action === "set_ad_schedule_bid_modifier") {
      const { campaignResourceName, schedule, bidModifier } = body as { campaignResourceName?: string; schedule?: { dayOfWeek: string; startHour: number; endHour: number }; bidModifier?: number };
      if (!campaignResourceName || !schedule || bidModifier === undefined) return NextResponse.json({ error: "Faltan parámetros." }, { status: 400 });
      await setAdScheduleBidModifier(customerId, auth, campaignResourceName, schedule, bidModifier);
      return NextResponse.json({ success: true });
    }
    if (action === "set_location_bid_modifier") {
      const { campaignResourceName, locationName, bidModifier } = body as { campaignResourceName?: string; locationName?: string; bidModifier?: number };
      if (!campaignResourceName || !locationName || bidModifier === undefined) return NextResponse.json({ error: "Faltan parámetros." }, { status: 400 });
      await setLocationBidModifier(customerId, auth, campaignResourceName, locationName, bidModifier);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido.";
    console.error(`[google-ads POST action=${action}]`, msg);
    // msg es seguro para el cliente (ver catch del GET): expone el [errorCode] real.
    return NextResponse.json({ error: msg }, { status: msg.includes("No hay") ? 404 : 502 });
  }
}
