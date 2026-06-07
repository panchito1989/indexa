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
  updateCampaignStatus,
  updateCampaignBudget,
  createFullCampaign,
  getHourlyPerformance,
  getDevicePerformance,
  getGeoPerformance,
  getAudiencePerformance,
  getExtensionPerformance,
  activateCampaign,
  addNegativeKeywords,
} from "@/lib/googleAdsClient";

export const maxDuration = 60;

const limiter = createRateLimiter({ windowMs: 60_000, max: 20 });
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

async function getCustomerId(uid: string): Promise<string> {
  const snap = await getAdminDb().collection("usuarios").doc(uid).get();
  const customerId = snap.data()?.googleAdsCustomerId as string | undefined;
  if (!customerId) throw new Error("No hay Customer ID de Google Ads configurado.");
  if (!/^\d+$/.test(customerId)) throw new Error("Customer ID de Google Ads inválido.");
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
  const rawCampaignId = searchParams.get("campaignId");
  if (rawCampaignId !== null && !/^\d+$/.test(rawCampaignId)) {
    return NextResponse.json({ error: "campaignId inválido." }, { status: 400 });
  }
  const campaignId = rawCampaignId ?? undefined;
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
      case "hourly":
        return NextResponse.json({ rows: await getHourlyPerformance(customerId, accessToken, dateRange) });
      case "device":
        return NextResponse.json({ rows: await getDevicePerformance(customerId, accessToken, dateRange) });
      case "geo":
        return NextResponse.json({ rows: await getGeoPerformance(customerId, accessToken, dateRange) });
      case "audiences":
        return NextResponse.json({ rows: await getAudiencePerformance(customerId, accessToken, dateRange) });
      case "extensions":
        return NextResponse.json({ rows: await getExtensionPerformance(customerId, accessToken, dateRange) });
      default:
        return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido.";
    console.error(`[google-ads GET action=${action}]`, msg);
    const isNotFound = msg.includes("No hay");
    const clientMsg = isNotFound ? msg : "Error al consultar Google Ads. Intenta de nuevo.";
    return NextResponse.json({ error: clientMsg }, { status: isNotFound ? 404 : 502 });
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

      const result = await createFullCampaign(customerId, accessToken, {
        campaignName, dailyBudgetMicros, startDate, endDate,
        targetCountry: targetCountry ?? "MX",
        adGroupName, keywords, adHeadlines, adDescriptions, finalUrl,
      });

      return NextResponse.json({ success: true, ...result });
    }

    if (action === "activate") {
      const { campaignResourceName } = body as { campaignResourceName?: string };
      if (!campaignResourceName) return NextResponse.json({ error: "Falta campaignResourceName." }, { status: 400 });
      await activateCampaign(customerId, accessToken, campaignResourceName);
      return NextResponse.json({ success: true });
    }

    if (action === "add_negative_keywords") {
      const { campaignResourceName, keywords } = body as { campaignResourceName?: string; keywords?: string[] };
      if (!campaignResourceName || !keywords?.length) return NextResponse.json({ error: "Faltan campaignResourceName o keywords." }, { status: 400 });
      const added = await addNegativeKeywords(customerId, accessToken, campaignResourceName, keywords);
      return NextResponse.json({ success: true, added });
    }

    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido.";
    console.error(`[google-ads POST action=${action}]`, msg);
    return NextResponse.json({ error: "Error al ejecutar acción en Google Ads. Intenta de nuevo." }, { status: 502 });
  }
}
