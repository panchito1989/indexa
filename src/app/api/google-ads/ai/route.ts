import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verifyAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  getGoogleAdsContext, getCampaigns, getAdGroups, getAds, getKeywords,
  getReporting, getAccountInfo, getAccountBudget,
  updateCampaignStatus, updateCampaignBudget,
  getHourlyPerformance, getDevicePerformance, getGeoPerformance, getAudiencePerformance, getExtensionPerformance,
  createFullCampaign, activateCampaign, addNegativeKeywords, addLocationTargeting,
  setDeviceBidModifier, setAdScheduleBidModifier, setLocationBidModifier,
  createConversionSetup, getConversionSetup, createPerformanceMaxCampaign,
  addCampaignExtensions, createRemarketingLists, listAudiences,
  type GoogleAdsAuth, type ConversionSetup,
} from "@/lib/googleAdsClient";
import { preparePmaxImages, generateAdPhotoBase64 } from "@/lib/adImages";

export const maxDuration = 300; // Vercel Pro: hasta 300s para flujos de creación de campañas (igual que meta-ads/ai y tiktok-ads/ai)

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODEL = "gemini-2.0-flash";

// ── Groq fallback helpers (verbatim from tiktok-ads/ai/route.ts) ──────

// SOLO créditos/cuota agotados → justifica caer a un proveedor más barato.
// (Antes incluía 529/"overloaded"/"rate limit", que son TRANSITORIOS: eso hacía
//  que a veces respondiera Claude y a veces un modelo más débil → contradicciones.)
function isBillingError(status: number, body: string): boolean {
  if (status === 402) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes("credit balance") ||
    lower.includes("billing") ||
    lower.includes("insufficient_quota") ||
    lower.includes("quota exceeded")
  );
}

// Errores transitorios → reintentar el MISMO modelo (Claude), nunca degradar.
function isTransientError(status: number, body: string): boolean {
  if (status === 429 || status === 529 || status >= 500) return true;
  const lower = body.toLowerCase();
  return lower.includes("overloaded") || lower.includes("rate limit");
}

type AnthropicContent = string | Record<string, unknown>[];
type AnthropicMessage = { role: "user" | "assistant"; content: AnthropicContent };
type GroqMessage = {
  role: string;
  content: string | null;
  tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

function toGroqTools(anthropicTools: typeof tools) {
  return anthropicTools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

function toGroqMessages(messages: AnthropicMessage[]): GroqMessage[] {
  const result: GroqMessage[] = [];
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }
    const blocks = msg.content as Record<string, unknown>[];
    if (msg.role === "user") {
      const toolResults = blocks.filter((b) => b.type === "tool_result");
      const textBlocks = blocks.filter((b) => b.type === "text");
      for (const tr of toolResults) {
        result.push({
          role: "tool",
          tool_call_id: tr.tool_use_id as string,
          content: typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content),
        });
      }
      if (textBlocks.length > 0) {
        result.push({ role: "user", content: (textBlocks as { text?: string }[]).map((b) => b.text ?? "").join("\n") });
      }
    } else {
      const textBlock = blocks.find((b) => b.type === "text") as { text?: string } | undefined;
      const toolUseBlocks = blocks.filter((b) => b.type === "tool_use") as {
        id: string; name: string; input: Record<string, unknown>;
      }[];
      const toolCalls = toolUseBlocks.map((tu) => ({
        id: tu.id,
        type: "function",
        function: { name: tu.name, arguments: JSON.stringify(tu.input) },
      }));
      result.push({
        role: "assistant",
        content: textBlock?.text ?? null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    }
  }
  return result;
}

function fromGroqResponse(groqData: Record<string, unknown>): Record<string, unknown> {
  const choices = groqData.choices as Record<string, unknown>[];
  const choice = choices?.[0];
  const message = choice?.message as {
    content?: string | null;
    tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  };
  const finishReason = choice?.finish_reason as string;

  const content: Record<string, unknown>[] = [];
  if (message?.content) content.push({ type: "text", text: message.content });
  for (const tc of message?.tool_calls ?? []) {
    let input: Record<string, unknown> = {};
    try { input = JSON.parse(tc.function.arguments); } catch { /* noop */ }
    content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
  }

  return {
    content,
    stop_reason: finishReason === "tool_calls" ? "tool_use" : "end_turn",
  };
}

// ── Auth + creds helper ───────────────────────────────────────────────

async function getGoogleAdsCreds(uid: string): Promise<{ accessToken: string; customerId: string; loginCustomerId: string }> {
  return getGoogleAdsContext(uid);
}

// ── Persistencia de la conversación (memoria entre sesiones) ───────────
type ChatTurn = { role: "user" | "assistant"; content: string };
const MAX_HISTORY = 20; // tope de turnos guardados (acota tamaño/tokens)

async function loadAiHistory(uid: string): Promise<ChatTurn[]> {
  const snap = await getAdminDb().collection("usuarios").doc(uid).get();
  const h = snap.data()?.googleAdsAiHistory;
  return Array.isArray(h) ? (h as ChatTurn[]) : [];
}

async function saveAiHistory(uid: string, history: { role: "user" | "assistant"; content: unknown }[]): Promise<void> {
  const slim: ChatTurn[] = history
    .map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" }))
    .filter((m) => m.content)
    .slice(-MAX_HISTORY);
  await getAdminDb().collection("usuarios").doc(uid).set({ googleAdsAiHistory: slim }, { merge: true });
}

// ── Conversiones: instalar la etiqueta en los sitios Indexa del usuario ──
// Denormaliza { awId, label } a sitios/{id}.googleAdsTag para que el render
// del sitio (y la bio) inyecten gtag sin lecturas extra. Devuelve cuántos
// sitios quedaron con etiqueta.
async function installTagOnUserSites(uid: string, setup: ConversionSetup): Promise<number> {
  const db = getAdminDb();
  const tag = { awId: setup.awId, label: setup.label };

  const byOwner = await db.collection("sitios").where("ownerId", "==", uid).limit(20).get();
  const ids = new Set(byOwner.docs.map((d) => d.id));

  // Fallback legacy: usuarios/{uid}.sitioId apunta a su sitio aunque ownerId falte.
  if (ids.size === 0) {
    const userSnap = await db.collection("usuarios").doc(uid).get();
    const sitioId = userSnap.data()?.sitioId;
    if (typeof sitioId === "string" && sitioId) ids.add(sitioId);
  }

  let installed = 0;
  for (const id of ids) {
    await db.collection("sitios").doc(id).set({ googleAdsTag: tag }, { merge: true });
    installed++;
  }
  return installed;
}

// Datos del sitio Indexa del usuario: imágenes (assets PMax/Display), slug
// (regla de la lista de remarketing) y teléfono (extensión de llamada).
async function getUserSiteImages(uid: string): Promise<{ logoUrl: string; heroImageUrl: string; galeria: string[]; slug: string; whatsapp: string }> {
  const db = getAdminDb();
  let data: Record<string, unknown> | undefined =
    (await db.collection("sitios").where("ownerId", "==", uid).limit(1).get()).docs[0]?.data();
  if (!data) {
    const sitioId = (await db.collection("usuarios").doc(uid).get()).data()?.sitioId;
    if (typeof sitioId === "string" && sitioId) {
      data = (await db.collection("sitios").doc(sitioId).get()).data();
    }
  }
  return {
    logoUrl: typeof data?.logoUrl === "string" ? (data.logoUrl as string) : "",
    heroImageUrl: typeof data?.heroImageUrl === "string" ? (data.heroImageUrl as string) : "",
    galeria: Array.isArray(data?.galeria)
      ? (data.galeria as unknown[]).filter((g): g is string => typeof g === "string")
      : [],
    slug: typeof data?.slug === "string" ? (data.slug as string) : "",
    whatsapp: typeof data?.whatsapp === "string" ? (data.whatsapp as string) : "",
  };
}

// ── Tool definitions ──────────────────────────────────────────────────

const tools = [
  { name: "get_account_info", description: "Información de la cuenta: nombre, customerId, moneda.",
    input_schema: { type: "object" as const, properties: {} } },
  { name: "list_campaigns", description: "Lista campañas con estado, tipo y presupuesto diario.",
    input_schema: { type: "object" as const, properties: {} } },
  { name: "list_ad_groups", description: "Lista ad groups; opcional filtrar por campaign_id (numérico).",
    input_schema: { type: "object" as const, properties: { campaign_id: { type: "string" } } } },
  { name: "list_ads", description: "Lista anuncios; opcional filtrar por campaign_id (numérico).",
    input_schema: { type: "object" as const, properties: { campaign_id: { type: "string" } } } },
  { name: "list_keywords", description: "Lista keywords con tipo de concordancia y Quality Score.",
    input_schema: { type: "object" as const, properties: { campaign_id: { type: "string" } } } },
  { name: "get_reporting", description: "Métricas por rango: TODAY, YESTERDAY, LAST_7_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH.",
    input_schema: { type: "object" as const, properties: { date_range: { type: "string", enum: ["TODAY","YESTERDAY","LAST_7_DAYS","LAST_30_DAYS","THIS_MONTH","LAST_MONTH"] } } } },
  { name: "get_budget", description: "Presupuesto de la cuenta.",
    input_schema: { type: "object" as const, properties: {} } },
  { name: "pause_campaign", description: "Pausa una campaña (requiere campaign_resource_name).",
    input_schema: { type: "object" as const, properties: { campaign_resource_name: { type: "string" } }, required: ["campaign_resource_name"] } },
  { name: "resume_campaign", description: "Reactiva una campaña pausada (requiere campaign_resource_name).",
    input_schema: { type: "object" as const, properties: { campaign_resource_name: { type: "string" } }, required: ["campaign_resource_name"] } },
  { name: "update_campaign_budget", description: "Cambia el presupuesto diario (budget_resource_name + monto en la moneda de la cuenta).",
    input_schema: { type: "object" as const, properties: { budget_resource_name: { type: "string" }, daily_amount: { type: "number" } }, required: ["budget_resource_name","daily_amount"] } },
  { name: "analyze_performance", description: "Resumen agregado de KPIs (cost, clicks, impressions, ctr, cpc, conversions) para diagnóstico.",
    input_schema: { type: "object" as const, properties: { date_range: { type: "string" } } } },
  { name: "get_hourly_performance", description: "Rendimiento por hora del día y día de semana (para modificadores de horario).", input_schema: { type: "object" as const, properties: { date_range: { type: "string" } } } },
  { name: "get_device_performance", description: "Rendimiento por dispositivo (MOBILE/DESKTOP/TABLET).", input_schema: { type: "object" as const, properties: { date_range: { type: "string" } } } },
  { name: "get_geo_performance", description: "Rendimiento por ubicación (ciudad/región, con nombres).", input_schema: { type: "object" as const, properties: { date_range: { type: "string" } } } },
  { name: "get_audience_performance", description: "Rendimiento por audiencia.", input_schema: { type: "object" as const, properties: { date_range: { type: "string" } } } },
  { name: "get_extension_performance", description: "Rendimiento de extensiones/assets.", input_schema: { type: "object" as const, properties: { date_range: { type: "string" } } } },
  { name: "compare_performance", description: "Compara KPIs (gasto, clics, impresiones, CTR, CPC, conversiones, CPA) entre DOS periodos. Úsalo cuando el usuario pida comparar (ej. '¿mejoré vs el mes pasado?', 'este año vs el anterior'). Es la ÚNICA herramienta que ve un periodo distinto al del panel.",
    input_schema: { type: "object" as const, properties: {
      range_a: { type: "string", enum: ["TODAY","YESTERDAY","LAST_7_DAYS","LAST_30_DAYS","THIS_MONTH","LAST_MONTH","LAST_90_DAYS","LAST_12_MONTHS","THIS_YEAR"], description: "periodo A (ej. TODAY, THIS_MONTH)" },
      range_b: { type: "string", enum: ["TODAY","YESTERDAY","LAST_7_DAYS","LAST_30_DAYS","THIS_MONTH","LAST_MONTH","LAST_90_DAYS","LAST_12_MONTHS","THIS_YEAR"], description: "periodo B contra el que comparar (ej. YESTERDAY, LAST_MONTH)" },
    }, required: ["range_a","range_b"] } },
  { name: "create_search_campaign", description: "Crea una campaña de búsqueda COMPLETA en PAUSA (presupuesto+campaña+grupo+keywords+anuncio+ubicación). Genera tú las keywords y los textos del anuncio a partir del negocio.",
    input_schema: { type: "object" as const, properties: {
      campaign_name: { type: "string" }, daily_budget: { type: "number", description: "presupuesto diario en la moneda de la cuenta" },
      final_url: { type: "string" }, location_name: { type: "string", description: "ciudad para segmentar, ej. 'Querétaro'" },
      keywords: { type: "array", items: { type: "object", properties: { text: { type: "string" }, match_type: { type: "string", enum: ["EXACT","PHRASE","BROAD"] } }, required: ["text","match_type"] } },
      headlines: { type: "array", items: { type: "string" }, description: "10-15 títulos ≤30 chars" },
      descriptions: { type: "array", items: { type: "string" }, description: "3-4 descripciones ≤90 chars" },
      bidding_strategy: { type: "string", enum: ["MAXIMIZE_CLICKS","MAXIMIZE_CONVERSIONS"], description: "MAXIMIZE_CLICKS por defecto. MAXIMIZE_CONVERSIONS SOLO si la cuenta ya mide conversiones (setup_conversion_tracking hecho) y el usuario lo confirmó." },
    }, required: ["campaign_name","daily_budget","final_url","keywords","headlines","descriptions"] } },
  { name: "setup_conversion_tracking", description: "Configura la medición de conversiones (el 'píxel' de Google): crea la acción 'Lead WhatsApp (Indexa)' en la cuenta y deja la etiqueta instalada AUTOMÁTICAMENTE en el sitio Indexa del usuario — cada clic al WhatsApp del sitio contará como conversión. Seguro: no gasta. Úsalo cuando el usuario quiera medir resultados/leads o antes de cambiar a puja por conversiones. Idempotente (si ya existe, la reutiliza).",
    input_schema: { type: "object" as const, properties: {} } },
  { name: "create_performance_max_campaign", description: "Crea una campaña Performance Max COMPLETA en PAUSA (presupuesto + campaña + asset group con textos e imágenes): Google la muestra en Búsqueda, Display, YouTube, Gmail y Maps optimizando a conversiones. REQUISITO: medición de conversiones configurada (setup_conversion_tracking). Las imágenes salen SOLAS del sitio Indexa del usuario (logo + foto principal, recortadas automáticamente); image_url/logo_url solo si el usuario da otras.",
    input_schema: { type: "object" as const, properties: {
      campaign_name: { type: "string" }, daily_budget: { type: "number", description: "presupuesto diario en la moneda de la cuenta" },
      final_url: { type: "string" }, business_name: { type: "string", description: "nombre del negocio ≤25 chars" },
      headlines: { type: "array", items: { type: "string" }, description: "3-5 títulos ≤30 chars" },
      long_headline: { type: "string", description: "1 título largo ≤90 chars" },
      descriptions: { type: "array", items: { type: "string" }, description: "2-5 descripciones; la PRIMERA ≤60 chars, el resto ≤90" },
      location_name: { type: "string", description: "ciudad para segmentar, ej. 'Querétaro'" },
      image_url: { type: "string", description: "OPCIONAL: URL de foto si el usuario da una distinta a las del sitio" },
      logo_url: { type: "string", description: "OPCIONAL: URL del logo si el usuario da uno distinto" },
      image_description: { type: "string", description: "OPCIONAL: si no hay fotos (ni del sitio ni image_url), descríbela y se GENERA con IA — describe la escena del negocio en español, estilo foto real (ej: 'técnico uniformado reparando una lavadora en una cocina moderna')" },
    }, required: ["campaign_name","daily_budget","final_url","business_name","headlines","long_headline","descriptions"] } },
  { name: "get_conversion_tracking_status", description: "Estado de la medición de conversiones: si existe la acción de conversión de Indexa y su etiqueta (awId/label).",
    input_schema: { type: "object" as const, properties: {} } },
  { name: "add_campaign_extensions", description: "Agrega extensiones a una campaña (suben CTR sin costo extra, seguro): callouts (frases cortas tipo 'Atención inmediata'), snippet estructurado (encabezado 'Servicios' + 3-10 valores) y/o botón de llamada (teléfono del negocio). Genera tú los textos a partir del negocio. Aplícalo directo tras crear una campaña, avisando qué agregaste.",
    input_schema: { type: "object" as const, properties: {
      campaign_resource_name: { type: "string" },
      callouts: { type: "array", items: { type: "string" }, description: "2-10 frases ≤25 chars" },
      snippet_header: { type: "string", description: "encabezado aprobado en español, casi siempre 'Servicios'" },
      snippet_values: { type: "array", items: { type: "string" }, description: "3-10 valores ≤25 chars (los servicios del negocio)" },
      phone_number: { type: "string", description: "teléfono del negocio (el del sitio Indexa si no dan otro)" },
      country_code: { type: "string", description: "MX (default) o US" },
    }, required: ["campaign_resource_name"] } },
  { name: "create_remarketing_lists", description: "Crea las listas base de remarketing (seguro, no gasta): 'Visitantes del sitio' (se llena sola con la etiqueta de Indexa) y 'Convirtieron' (quienes ya dieron clic a WhatsApp). Google las empieza a usar al juntar ~100 usuarios (Display) / ~1,000 (Búsqueda). Idempotente.",
    input_schema: { type: "object" as const, properties: {} } },
  { name: "list_audiences", description: "Lista las audiencias/listas de remarketing de la cuenta con su tamaño actual (Display y Búsqueda).",
    input_schema: { type: "object" as const, properties: {} } },
  { name: "activate_campaign", description: "Activa (ENABLED) una campaña en pausa. USAR SOLO tras confirmación explícita del usuario.",
    input_schema: { type: "object" as const, properties: { campaign_resource_name: { type: "string" } }, required: ["campaign_resource_name"] } },
  { name: "add_negative_keywords", description: "Agrega keywords negativas a una campaña (corta búsquedas irrelevantes; seguro, solo reduce gasto).",
    input_schema: { type: "object" as const, properties: { campaign_resource_name: { type: "string" }, keywords: { type: "array", items: { type: "string" } } }, required: ["campaign_resource_name","keywords"] } },
  { name: "set_device_bid_modifier", description: "Aplica un modificador de puja por dispositivo a una campaña. USAR SOLO tras confirmación. bid_modifier: 1.0=sin cambio, 0.8=-20%, 1.3=+30% (se acota a 0.1-3.0).",
    input_schema: { type: "object" as const, properties: { campaign_resource_name: { type: "string" }, device: { type: "string", enum: ["MOBILE","DESKTOP","TABLET"] }, bid_modifier: { type: "number" } }, required: ["campaign_resource_name","device","bid_modifier"] } },
  { name: "set_ad_schedule_bid_modifier", description: "Aplica un modificador de puja por horario (día + franja horaria). USAR SOLO tras confirmación.",
    input_schema: { type: "object" as const, properties: { campaign_resource_name: { type: "string" }, day_of_week: { type: "string", enum: ["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"] }, start_hour: { type: "number" }, end_hour: { type: "number" }, bid_modifier: { type: "number" } }, required: ["campaign_resource_name","day_of_week","start_hour","end_hour","bid_modifier"] } },
  { name: "set_location_bid_modifier", description: "Aplica un modificador de puja por ubicación. USAR SOLO tras confirmación.",
    input_schema: { type: "object" as const, properties: { campaign_resource_name: { type: "string" }, location_name: { type: "string" }, bid_modifier: { type: "number" } }, required: ["campaign_resource_name","location_name","bid_modifier"] } },
];

// ── Tool executor ─────────────────────────────────────────────────────

async function executeTool(
  name: string, input: Record<string, unknown>, customerId: string, auth: GoogleAdsAuth,
  uid: string, dashboardRange: string, custom?: { startDate: string; endDate: string },
): Promise<string> {
  // El periodo SIEMPRE es el que el usuario ve en el dashboard. NO dejamos que el
  // modelo lo elija (antes mandaba date_range="LAST_7_DAYS" y se ignoraba el dashboard
  // → la IA solo veía 7 días aunque el panel mostrara un año).
  const dr = dashboardRange;
  const campaignId = (input.campaign_id as string) || undefined;
  try {
    switch (name) {
      case "get_account_info":
        return JSON.stringify(await getAccountInfo(customerId, auth), null, 2);
      case "list_campaigns":
        return JSON.stringify(await getCampaigns(customerId, auth), null, 2);
      case "list_ad_groups":
        return JSON.stringify(await getAdGroups(customerId, auth, campaignId), null, 2);
      case "list_ads":
        return JSON.stringify(await getAds(customerId, auth, campaignId), null, 2);
      case "list_keywords":
        return JSON.stringify(await getKeywords(customerId, auth, campaignId), null, 2);
      case "get_reporting":
        return JSON.stringify(await getReporting(customerId, auth, dr, custom), null, 2);
      case "get_budget":
        return JSON.stringify(await getAccountBudget(customerId, auth), null, 2);
      case "pause_campaign":
        await updateCampaignStatus(customerId, auth, input.campaign_resource_name as string, "PAUSED");
        return "Campaña pausada.";
      case "resume_campaign":
        await updateCampaignStatus(customerId, auth, input.campaign_resource_name as string, "ENABLED");
        return "Campaña reactivada.";
      case "update_campaign_budget": {
        const micros = Math.round((input.daily_amount as number) * 1_000_000);
        await updateCampaignBudget(customerId, auth, input.budget_resource_name as string, micros);
        return `Presupuesto actualizado a ${input.daily_amount}.`;
      }
      case "analyze_performance": {
        const rows = await getReporting(customerId, auth, dr, custom);
        const t = rows.reduce((a, r) => ({ cost: a.cost + r.cost, clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions, conversions: a.conversions + r.conversions }), { cost: 0, clicks: 0, impressions: 0, conversions: 0 });
        const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
        const cpc = t.clicks > 0 ? t.cost / t.clicks : 0;
        return JSON.stringify({ period: dr, totals: { ...t, ctr: `${ctr.toFixed(2)}%`, cpc: cpc.toFixed(2) } }, null, 2);
      }
      case "get_hourly_performance": return JSON.stringify(await getHourlyPerformance(customerId, auth, dr, custom), null, 2);
      case "get_device_performance": return JSON.stringify(await getDevicePerformance(customerId, auth, dr, custom), null, 2);
      case "get_geo_performance": return JSON.stringify(await getGeoPerformance(customerId, auth, dr, custom), null, 2);
      case "get_audience_performance": return JSON.stringify(await getAudiencePerformance(customerId, auth, dr, custom), null, 2);
      case "get_extension_performance": return JSON.stringify(await getExtensionPerformance(customerId, auth, dr, custom), null, 2);
      case "compare_performance": {
        const agg = async (range: string) => {
          const rows = await getReporting(customerId, auth, range);
          const t = rows.reduce((a, r) => ({ cost: a.cost + r.cost, clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions, conversions: a.conversions + r.conversions }), { cost: 0, clicks: 0, impressions: 0, conversions: 0 });
          return {
            period: range,
            cost: Number(t.cost.toFixed(2)), clicks: t.clicks, impressions: t.impressions, conversions: t.conversions,
            ctr: t.impressions > 0 ? `${((t.clicks / t.impressions) * 100).toFixed(2)}%` : "0%",
            cpc: Number((t.clicks > 0 ? t.cost / t.clicks : 0).toFixed(2)),
            cpa: t.conversions > 0 ? Number((t.cost / t.conversions).toFixed(2)) : null,
          };
        };
        const ra = (input.range_a as string) || dashboardRange;
        const rb = (input.range_b as string) || "LAST_MONTH";
        return JSON.stringify({ a: await agg(ra), b: await agg(rb) }, null, 2);
      }
      case "create_search_campaign": {
        const result = await createFullCampaign(customerId, auth, {
          campaignName: input.campaign_name as string,
          dailyBudgetMicros: Math.round(((input.daily_budget as number) || 0) * 1_000_000),
          startDate: new Date().toISOString().slice(0, 10).replace(/-/g, ""),
          targetCountry: "MX",
          adGroupName: `${input.campaign_name} - Grupo 1`,
          keywords: (input.keywords as Array<{ text: string; match_type: "EXACT"|"PHRASE"|"BROAD" }>).map((k) => ({ text: k.text, matchType: k.match_type })),
          adHeadlines: input.headlines as string[],
          adDescriptions: input.descriptions as string[],
          finalUrl: input.final_url as string,
          biddingStrategy: (input.bidding_strategy as "MAXIMIZE_CLICKS" | "MAXIMIZE_CONVERSIONS") || "MAXIMIZE_CLICKS",
        });
        let locationTargeted = false;
        if (input.location_name) locationTargeted = await addLocationTargeting(customerId, auth, result.campaignResourceName, input.location_name as string).catch((e) => { console.error("[google-ads/ai] location targeting:", e instanceof Error ? e.message : e); return false; });
        return JSON.stringify({
          ...result, status: "PAUSED", locationTargeted,
          note: locationTargeted
            ? "Campaña creada en PAUSA. Pide confirmación antes de activar."
            : "Campaña creada en PAUSA. ⚠️ No se pudo segmentar la ubicación automáticamente — dile al usuario que confirme el nombre exacto de la ciudad o que la configure en Google Ads. Pide confirmación antes de activar.",
        }, null, 2);
      }
      case "activate_campaign":
        await activateCampaign(customerId, auth, input.campaign_resource_name as string);
        return "Campaña ACTIVADA.";
      case "add_negative_keywords": {
        const added = await addNegativeKeywords(customerId, auth, input.campaign_resource_name as string, input.keywords as string[]);
        return `Agregadas ${added} keywords negativas.`;
      }
      case "set_device_bid_modifier": {
        const n = await setDeviceBidModifier(customerId, auth, input.campaign_resource_name as string, input.device as string, input.bid_modifier as number);
        return `Modificador de dispositivo aplicado a ${n} grupo(s).`;
      }
      case "set_ad_schedule_bid_modifier":
        await setAdScheduleBidModifier(customerId, auth, input.campaign_resource_name as string, { dayOfWeek: input.day_of_week as string, startHour: input.start_hour as number, endHour: input.end_hour as number }, input.bid_modifier as number);
        return "Modificador de horario aplicado.";
      case "set_location_bid_modifier":
        await setLocationBidModifier(customerId, auth, input.campaign_resource_name as string, input.location_name as string, input.bid_modifier as number);
        return "Modificador de ubicación aplicado.";
      case "create_performance_max_campaign": {
        // PMax puja a conversiones: sin medición configurada es tirar dinero.
        const conv = await getConversionSetup(customerId, auth);
        if (!conv) {
          return "ERROR: Performance Max requiere la medición de conversiones configurada. Ejecuta setup_conversion_tracking primero (no gasta, es 1 paso) y reintenta.";
        }
        const site = await getUserSiteImages(uid);
        const photoUrl = (input.image_url as string) || site.heroImageUrl || site.galeria[0] || "";
        const logoUrl = (input.logo_url as string) || site.logoUrl || "";
        let photoBase64 = "";
        if (!photoUrl && input.image_description) {
          photoBase64 = await generateAdPhotoBase64(input.image_description as string);
        }
        if (!photoUrl && !photoBase64) {
          return "ERROR: No hay imágenes para los anuncios: el sitio Indexa del usuario no tiene fotos. Opciones: (1) pide una URL de foto (image_url), o (2) GENERA una con IA pasando image_description — describe tú la escena del negocio y reintenta.";
        }
        const imgs = await preparePmaxImages({
          photoUrl: photoUrl || undefined,
          photoBase64: photoBase64 || undefined,
          logoUrl: logoUrl || undefined,
        });
        const result = await createPerformanceMaxCampaign(customerId, auth, {
          campaignName: input.campaign_name as string,
          dailyBudgetMicros: Math.round(((input.daily_budget as number) || 0) * 1_000_000),
          finalUrl: input.final_url as string,
          businessName: input.business_name as string,
          headlines: input.headlines as string[],
          longHeadline: input.long_headline as string,
          descriptions: input.descriptions as string[],
          marketingImageB64: imgs.marketingImage,
          squareImageB64: imgs.squareImage,
          logoImageB64: imgs.logoImage,
        });
        let locationTargeted = false;
        if (input.location_name) {
          locationTargeted = await addLocationTargeting(customerId, auth, result.campaignResourceName, input.location_name as string).catch((e) => { console.error("[google-ads/ai] location targeting:", e instanceof Error ? e.message : e); return false; });
        }
        return JSON.stringify({
          ...result, status: "PAUSED", locationTargeted,
          imagenes: { foto: photoUrl ? photoUrl.slice(0, 100) : "(generada con IA)", logoUsado: !!logoUrl },
          note: locationTargeted
            ? "Campaña Performance Max creada en PAUSA con imágenes del sitio. Pide confirmación antes de activar."
            : "Campaña Performance Max creada en PAUSA. ⚠️ La ubicación no quedó segmentada — confirma el nombre de la ciudad con el usuario. Pide confirmación antes de activar.",
        }, null, 2);
      }
      case "setup_conversion_tracking": {
        const setup = await createConversionSetup(customerId, auth);
        const sitiosConEtiqueta = await installTagOnUserSites(uid, setup);
        await getAdminDb().collection("usuarios").doc(uid).set({
          googleAdsConversion: {
            resourceName: setup.resourceName, name: setup.name,
            awId: setup.awId, label: setup.label, configuredAt: Date.now(),
          },
        }, { merge: true });
        return JSON.stringify({
          conversionAction: setup.name,
          status: setup.status,
          etiqueta: `${setup.awId}/${setup.label}`,
          yaExistia: !setup.created,
          sitiosConEtiqueta,
          note: sitiosConEtiqueta > 0
            ? "Etiqueta instalada automáticamente en el sitio Indexa: cada clic al WhatsApp del sitio contará como conversión. Las primeras conversiones pueden tardar hasta 24h en reflejarse."
            : "La acción de conversión quedó creada, pero este usuario no tiene un sitio Indexa vinculado donde instalar la etiqueta — dile que la medición funcionará cuando su sitio Indexa esté activo.",
        }, null, 2);
      }
      case "get_conversion_tracking_status": {
        const setup = await getConversionSetup(customerId, auth);
        if (!setup) return JSON.stringify({ configurado: false, note: "Sin medición de conversiones. Ofrece configurarla con setup_conversion_tracking (no gasta)." });
        return JSON.stringify({ configurado: true, conversionAction: setup.name, status: setup.status, etiqueta: `${setup.awId}/${setup.label}` }, null, 2);
      }
      case "add_campaign_extensions": {
        const site = await getUserSiteImages(uid);
        const result = await addCampaignExtensions(customerId, auth, input.campaign_resource_name as string, {
          callouts: input.callouts as string[] | undefined,
          snippetHeader: input.snippet_header as string | undefined,
          snippetValues: input.snippet_values as string[] | undefined,
          phoneNumber: (input.phone_number as string) || site.whatsapp || undefined,
          countryCode: input.country_code as string | undefined,
        });
        return JSON.stringify({ ...result, note: "Extensiones agregadas a la campaña. Google las muestra cuando ayudan al anuncio (sin costo extra por mostrarlas)." }, null, 2);
      }
      case "create_remarketing_lists": {
        const site = await getUserSiteImages(uid);
        const conv = await getConversionSetup(customerId, auth).catch(() => null);
        const fragment = site.slug ? `/sitio/${site.slug}` : "";
        if (!fragment) {
          return "ERROR: El usuario no tiene un sitio Indexa vinculado — la lista de visitantes se basa en la URL de su sitio. Verifica su sitio primero.";
        }
        const lists = await createRemarketingLists(customerId, auth, fragment, conv?.resourceName);
        return JSON.stringify({
          ...lists,
          note: conv
            ? "Listas creadas. Se llenan SOLAS con la etiqueta del sitio; usables al juntar ~100 usuarios (Display) / ~1,000 (Búsqueda). Revísalas luego con list_audiences."
            : "Lista de visitantes creada. La de 'Convirtieron' requiere la medición de conversiones (setup_conversion_tracking) — ofrécelo.",
        }, null, 2);
      }
      case "list_audiences":
        return JSON.stringify(await listAudiences(customerId, auth), null, 2);
      default:
        return `Herramienta desconocida: ${name}`;
    }
  } catch (e) {
    // JSON.stringify para throws que no son Error: String(objeto) produce
    // "[object Object]" y destruye el diagnóstico.
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    // Sin este log, los errores de herramientas solo los ve el modelo y no
    // quedan rastro en los logs de Vercel.
    console.error(`[google-ads/ai] tool error (${name}):`, msg);
    return `ERROR: ${msg}`;
  }
}

// ── Saneador de mensajes para la API ──────────────────────────────────
// La API rechaza mensajes con contenido vacío ("user messages must have
// non-empty content", HTTP 400) y eso tiraba turnos completos del asistente.
// Antes de CADA llamada: fuera mensajes vacíos, y todo tool_result lleva
// contenido string no vacío.
type LoopMsg = { role: "user" | "assistant"; content: string | Record<string, unknown>[] };
function sanitizeForApi(msgs: LoopMsg[]): LoopMsg[] {
  const out: LoopMsg[] = [];
  for (const m of msgs) {
    if (typeof m.content === "string") {
      if (m.content.trim()) out.push(m);
      else console.warn(`[google-ads/ai] descartando mensaje ${m.role} con texto vacío`);
      continue;
    }
    if (Array.isArray(m.content)) {
      const blocks = m.content.filter(Boolean).map((b) => {
        if (b.type === "tool_result" && (typeof b.content !== "string" || !b.content)) {
          return { ...b, content: "(sin resultado)" };
        }
        return b;
      });
      if (blocks.length) out.push({ ...m, content: blocks });
      else console.warn(`[google-ads/ai] descartando mensaje ${m.role} con bloques vacíos`);
      continue;
    }
    console.warn("[google-ads/ai] descartando mensaje con contenido inválido");
  }
  return out;
}

// ── System prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres el gestor de Google Ads de Indexa: ayudas a dueños de negocio SIN conocimientos de publicidad a crear y optimizar campañas hablando normal. SIEMPRE en español, simple, sin jerga (si usas un término técnico, explícalo en 1 línea).

═══ CÓMO RESPONDES (CRÍTICO) ═══
- Cada mensaje del usuario recibe UNA sola respuesta tuya. NO existe un "después": no puedes contestar en otro momento ni trabajar en segundo plano.
- PROHIBIDO prometer trabajo futuro. Nunca digas "voy a revisar y te aviso", "dame un momento", "en breve te digo", "ahora lo analizo y vuelvo", "permíteme un instante". Si necesitas datos, USA las herramientas AHORA (en este mismo turno) y entrega el resultado completo.
- Si mencionas que vas a usar una herramienta, úsala en este turno; no la anuncies y termines.
- CIERRA SIEMPRE: termina con (a) el resultado concreto + qué hiciste, o (b) una pregunta de confirmación clara si necesitas un "sí" antes de una acción que gasta. Nunca termines a medias ni dejes al usuario esperando.
- Tras usar herramientas, di en concreto qué encontraste/hiciste y que YA está hecho.

═══ SEGURIDAD (CRÍTICO) ═══
- NUNCA actives una campaña ni subas presupuesto sin un "sí" explícito del usuario en el chat.
- Toda campaña se crea en PAUSA (create_search_campaign ya lo hace). Resúmela y pregunta "¿la activo?".
- Pausar o agregar keywords negativas es seguro (no gasta) → puedes hacerlo directo, avisando qué hiciste.
- Procesa solo KPIs estándar (cost, clicks, impressions, ctr, cpc, conversions). No inventes datos.

═══ CREAR (el caso principal) ═══
1. Haz máximo 2-3 preguntas simples si faltan: ¿qué vendes/servicio?, ¿en qué ciudad?, ¿cuánto al día puedes invertir?, ¿tienes página web (URL)?
2. Con eso, GENERA tú: nombre de campaña, 10-15 keywords relevantes (con match_type: la mayoría PHRASE/BROAD, 2-3 EXACT), 10-15 títulos (≤30 caracteres c/u) y 3-4 descripciones (≤90 c/u), en español, orientados a ese negocio y ciudad.
3. Llama create_search_campaign con todo. Si no hay URL, pídela (la campaña de búsqueda la necesita; normalmente es su sitio Indexa).
4. Responde simple: "Creé tu campaña EN PAUSA: presupuesto $X/día, ciudad Y, N keywords, ejemplo de anuncio '...'. ¿La activo?".

═══ PERFORMANCE MAX ═══
- create_performance_max_campaign: para quien quiere "estar en todos lados" — UNA campaña que Google muestra en Búsqueda, Display, YouTube, Gmail y Maps optimizando a conversiones.
- REQUIERE medición de conversiones ya configurada (setup_conversion_tracking). Si no está, ofrécelo primero (1 paso, no gasta).
- Las imágenes salen SOLAS del sitio Indexa del usuario (logo + foto, recortadas automático). Si su sitio no tiene fotos: ofrécele 2 opciones — que te pase una URL de foto (image_url) o GENERARLA con IA (image_description: describe tú la escena del negocio en español, estilo foto real; confírmale qué generarás).
- Genera tú los textos: business_name ≤25, 3-5 headlines ≤30, long_headline ≤90, 2-5 descriptions (la PRIMERA ≤60). Igual que búsqueda: nace en PAUSA → resume y pregunta "¿la activo?".
- ¿Búsqueda o PMax? Búsqueda = control fino por keyword (mejor primer paso). PMax = alcance máximo cuando ya hay conversiones midiendo. Si dudas, recomienda empezar con búsqueda y sumar PMax después.

═══ EXTENSIONES (tras crear campañas) ═══
- Después de crear cualquier campaña de búsqueda, agrega extensiones con add_campaign_extensions (es seguro y sube el CTR gratis): genera 4-6 callouts (≤25 chars, beneficios concretos del negocio), snippet 'Servicios' con sus servicios, y el teléfono (usa el del sitio Indexa automáticamente). Avísale al usuario qué agregaste.

═══ REMARKETING (audiencias) ═══
- create_remarketing_lists crea las listas base (no gasta): 'Visitantes del sitio' (la llena la etiqueta de Indexa sola) y 'Convirtieron'. Ofrécelo junto con la medición de conversiones.
- Las listas tardan en llenarse: usables con ~100 usuarios (Display) / ~1,000 (Búsqueda). Si el usuario pregunta "¿ya sirven mis audiencias?", revisa con list_audiences y dile los tamaños.

═══ CONVERSIONES (medición) ═══
- setup_conversion_tracking configura el "píxel" de Google en UN paso: crea la acción "Lead WhatsApp (Indexa)" y deja la etiqueta instalada SOLA en el sitio Indexa del usuario (cada clic al botón de WhatsApp del sitio = 1 conversión). No gasta nada → puedes hacerlo directo cuando el usuario quiera "medir resultados/leads/conversiones", avisando qué hiciste.
- Tras crear la primera campaña de un usuario, RECOMIENDA configurar la medición (1 línea, simple: "¿quieres que cada WhatsApp que te llegue del anuncio se cuente como conversión? Lo dejo listo yo").
- Las campañas nuevas usan Maximizar clics por defecto. Sugiere bidding_strategy=MAXIMIZE_CONVERSIONS SOLO cuando: la medición ya está configurada Y la cuenta acumula ~30+ conversiones en 30 días. Cambiar la puja afecta el gasto → pide confirmación.
- Si el usuario pregunta "¿cuántos leads/conversiones tengo?", usa get_reporting (columna conversions) y aclara el periodo.

═══ OPTIMIZAR ═══
- Diagnostica con get_reporting + get_hourly/device/geo/audience/extension_performance. Compara contra el promedio.
- Para COMPARAR dos periodos (ej. "¿mejoré vs el mes pasado?", "este año vs el anterior") usa compare_performance(range_a, range_b). Es la única herramienta que ve un periodo distinto al del panel; el resto SIEMPRE usan el periodo activo.
- Da máximo 3 acciones claras. Aplica lo seguro (pausar lo malo, agregar negative keywords). Para subir presupuesto o activar, pide confirmación.
- Modificadores de puja por hora/ubicación/dispositivo: primero RECOMIENDA con datos (ej. "-20% en madrugada, +30% en móvil"); CAMBIAN cuánto se gasta → aplícalos (set_*_bid_modifier) SOLO tras un "sí" explícito. El valor se acota a 0.1–3.0 (−90%..+200%).
- IMPORTANTE (puja automática): los modificadores MANUALES de horario y ubicación solo funcionan con puja MANUAL (CPC manual). La mayoría de campañas usan puja AUTOMÁTICA (Smart Bidding), donde Google YA optimiza horario/ubicación/dispositivo en cada subasta → ahí estos modificadores se RECHAZAN o se IGNORAN (no es error tuyo). Si un set_*_bid_modifier falla por estrategia/permiso, explícalo simple: "tu campaña usa puja automática; Google ya ajusta esto solo, no hace falta", y optimiza con lo que SÍ sirve: presupuesto, negative keywords, pausar lo que no rinde, o excluir un dispositivo entero (−100%).

═══ FORMATO ═══
Respuestas cortas. Tablas Markdown solo cuando ayuden. Montos $1,234.56, porcentajes 2.5%. Muestra errores exactos de Google Ads.`;

// ── POST handler ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!(await checkRateLimit(`ai-ip:${ip}`, 30, 60))) {
      return NextResponse.json({ error: "Demasiadas solicitudes. Intenta en un minuto." }, { status: 429 });
    }

    const authHeader = request.headers.get("authorization") || "";
    const fbToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!fbToken) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

    const user = await verifyIdToken(fbToken);
    if (!user) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

    if (!(await checkRateLimit(`ai-uid:${user.uid}`, 12, 60))) {
      return NextResponse.json({ error: "Demasiadas solicitudes. Espera un momento." }, { status: 429 });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY no configurada. Agrégala en las variables de entorno de Vercel." },
        { status: 503 }
      );
    }

    let body: { message?: string; history?: unknown; dateRange?: string; customStart?: string; customEnd?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo de solicitud inválido." }, { status: 400 });
    }

    const { message, history } = body;
    if (!message?.trim()) {
      return NextResponse.json({ error: "Faltan parámetros: message." }, { status: 400 });
    }

    // Ventana de análisis = la que el usuario ve en el dashboard (consistencia).
    const dashboardRange = (typeof body.dateRange === "string" && body.dateRange) || "LAST_7_DAYS";
    let custom: { startDate: string; endDate: string } | undefined;
    if (dashboardRange === "CUSTOM") {
      const ISO = /^\d{4}-\d{2}-\d{2}$/;
      if (body.customStart && body.customEnd && ISO.test(body.customStart) && ISO.test(body.customEnd)) {
        custom = { startDate: body.customStart, endDate: body.customEnd };
      }
    }
    const rangeLabel = custom ? `${custom.startDate} a ${custom.endDate}` : dashboardRange;
    const systemPrompt = `${SYSTEM_PROMPT}\n\n═══ VENTANA ACTIVA ═══\nTODOS los datos que devuelven las herramientas corresponden al periodo: ${rangeLabel}. NO puedes cambiar ese periodo desde aquí — si el usuario quiere otro, dile que lo ajuste en el selector de fechas del panel. SIEMPRE menciona en tu respuesta que analizaste el periodo: ${rangeLabel}.`;

    let creds: { accessToken: string; customerId: string; loginCustomerId: string };
    try {
      creds = await getGoogleAdsCreds(user.uid);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Error al obtener credenciales de Google Ads." },
        { status: 400 }
      );
    }
    const auth: GoogleAdsAuth = { accessToken: creds.accessToken, loginCustomerId: creds.loginCustomerId };

    type MsgContent = string | Record<string, unknown>[];
    const messages: { role: "user" | "assistant"; content: MsgContent }[] = [
      ...(Array.isArray(history) ? (history as { role: "user" | "assistant"; content: MsgContent }[]) : []),
      { role: "user", content: message },
    ];

    let lastText = "";
    let useFallback = false;
    const fallbackKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY;
    const fallbackUrl = process.env.GROQ_API_KEY ? GROQ_URL : GEMINI_URL;
    const fallbackModel = process.env.GROQ_API_KEY ? GROQ_MODEL : GEMINI_MODEL;

    // Agentic loop — up to 10 rounds
    for (let round = 0; round < 10; round++) {
      let response: Record<string, unknown>;

      if (!useFallback) {
        let claudeRes!: Response;
        let claudeText = "";
        // Reintenta el MISMO modelo en errores transitorios (saturación/5xx) antes de
        // rendirse — evita degradar a un modelo más débil por un hipo temporal.
        for (let attempt = 0; ; attempt++) {
          claudeRes = await fetch(ANTHROPIC_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": anthropicKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: CLAUDE_MODEL,
              max_tokens: 1536,
              temperature: 0, // determinista → recomendaciones consistentes
              system: systemPrompt,
              tools,
              messages: sanitizeForApi(messages as LoopMsg[]),
            }),
          });
          claudeText = await claudeRes.text();
          if (claudeRes.ok) break;
          if (isTransientError(claudeRes.status, claudeText) && attempt < 3) {
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
          break;
        }

        if (!claudeRes.ok) {
          if (isBillingError(claudeRes.status, claudeText) && fallbackKey) {
            const provider = process.env.GROQ_API_KEY ? "Groq" : "Gemini";
            console.warn(`[google-ads/ai] Claude billing/quota error — switching to ${provider} fallback`);
            useFallback = true;
          } else {
            let errMsg = `Error de Claude API (HTTP ${claudeRes.status}): ${claudeText.slice(0, 300)}`;
            try {
              const parsed = JSON.parse(claudeText);
              errMsg = `Error de Claude API (HTTP ${claudeRes.status}): ${parsed?.error?.message || claudeText.slice(0, 200)}`;
            } catch { /* noop */ }
            console.error("[google-ads/ai] Claude error:", errMsg);
            return NextResponse.json({ error: errMsg }, { status: 400 });
          }
        } else {
          try {
            response = JSON.parse(claudeText);
          } catch {
            return NextResponse.json({ error: "Respuesta inválida de Claude API." }, { status: 400 });
          }
        }
      }

      if (useFallback) {
        if (!fallbackKey) {
          return NextResponse.json(
            { error: "Límite de créditos de Claude alcanzado. Configura GEMINI_API_KEY o GROQ_API_KEY como fallback." },
            { status: 503 }
          );
        }
        const groqRes = await fetch(fallbackUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${fallbackKey}`,
          },
          body: JSON.stringify({
            model: fallbackModel,
            max_tokens: 1536,
            temperature: 0,
            tools: toGroqTools(tools),
            tool_choice: "auto",
            messages: [
              { role: "system", content: systemPrompt },
              ...toGroqMessages(sanitizeForApi(messages as LoopMsg[]) as AnthropicMessage[]),
            ],
          }),
        });

        const groqText = await groqRes.text();
        if (!groqRes.ok) {
          let errMsg = `Error de IA fallback (HTTP ${groqRes.status}): ${groqText.slice(0, 300)}`;
          try {
            const parsed = JSON.parse(groqText);
            errMsg = `Error de IA fallback: ${parsed?.error?.message || groqText.slice(0, 200)}`;
          } catch { /* noop */ }
          console.error("[google-ads/ai] fallback error:", errMsg);
          return NextResponse.json({ error: errMsg }, { status: 400 });
        }
        try {
          const groqData = JSON.parse(groqText);
          response = fromGroqResponse(groqData);
        } catch {
          return NextResponse.json({ error: "Respuesta inválida de IA fallback." }, { status: 400 });
        }
      }

      // response is guaranteed assigned here (either from Claude or fallback)
      response = response!;

      // Capture any text from this response
      const contentBlocks = (response.content as { type: string; text?: string }[]) || [];
      const textBlock = contentBlocks.find((c) => c.type === "text");
      if (textBlock?.text) lastText = textBlock.text;

      if (response.stop_reason === "end_turn") {
        const finalHistory: { role: "user" | "assistant"; content: unknown }[] = [
          ...(Array.isArray(history) ? (history as { role: "user" | "assistant"; content: unknown }[]) : []),
          { role: "user", content: message },
          { role: "assistant", content: lastText },
        ];
        await saveAiHistory(user.uid, finalHistory);
        return NextResponse.json({ reply: lastText, history: finalHistory });
      }

      if (response.stop_reason === "tool_use") {
        const content = (response.content as Record<string, unknown>[]) || [];
        const toolBlocks = content.filter((c) => c.type === "tool_use") as {
          type: string; id: string; name: string; input: Record<string, unknown>;
        }[];

        messages.push({ role: "assistant", content });

        const toolResults: { type: string; tool_use_id: string; content: string }[] = [];
        for (const block of toolBlocks) {
          const result = await executeTool(block.name, block.input, creds.customerId, auth, user.uid, dashboardRange, custom);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result || "(sin resultado)" });
        }

        messages.push({ role: "user", content: toolResults });
        continue;
      }

      break;
    }

    // Se agotaron las rondas con herramientas: fuerza una conclusión SIN herramientas,
    // para no devolver un preámbulo ("déjame revisar…") y dejar al usuario esperando.
    if (!useFallback) {
      try {
        const finalRes = await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 1536,
            temperature: 0,
            system: systemPrompt + "\n\nYA NO PUEDES USAR HERRAMIENTAS. Responde AHORA, en este mismo mensaje, con lo que ya tienes: resume en concreto qué encontraste o hiciste y termina. No prometas nada para después.",
            messages: sanitizeForApi(messages as LoopMsg[]),
          }),
        });
        if (finalRes.ok) {
          const fd = JSON.parse(await finalRes.text()) as { content?: { type: string; text?: string }[] };
          const tb = (fd.content || []).find((c) => c.type === "text");
          if (tb?.text) lastText = tb.text;
        }
      } catch { /* usa el lastText existente */ }
    }

    // Exhausted loop — return last captured text or fallback message
    const fallback = lastText || "No se pudo completar la solicitud. Intenta de nuevo.";
    const finalHistory: { role: "user" | "assistant"; content: unknown }[] = [
      ...(Array.isArray(history) ? (history as { role: "user" | "assistant"; content: unknown }[]) : []),
      { role: "user", content: message },
      { role: "assistant", content: fallback },
    ];
    await saveAiHistory(user.uid, finalHistory);
    return NextResponse.json({ reply: fallback, history: finalHistory });

  } catch (err) {
    console.error("[google-ads/ai] unhandled error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error del asistente. Intenta de nuevo." }, { status: 400 });
  }
}

// ── GET: cargar la conversación guardada (memoria entre sesiones) ───────
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const fbToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!fbToken) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const user = await verifyIdToken(fbToken);
  if (!user) return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  try {
    return NextResponse.json({ history: await loadAiHistory(user.uid) });
  } catch {
    return NextResponse.json({ history: [] });
  }
}

// ── DELETE: borrar la conversación (botón "Nueva conversación") ─────────
export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const fbToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!fbToken) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const user = await verifyIdToken(fbToken);
  if (!user) return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  try {
    await getAdminDb().collection("usuarios").doc(user.uid).set({ googleAdsAiHistory: [] }, { merge: true });
  } catch { /* noop */ }
  return NextResponse.json({ success: true });
}
