import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verifyAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  getValidAccessToken, getCampaigns, getAdGroups, getAds, getKeywords,
  getReporting, getAccountInfo, getAccountBudget,
  updateCampaignStatus, updateCampaignBudget,
  getHourlyPerformance, getDevicePerformance, getGeoPerformance, getAudiencePerformance, getExtensionPerformance,
  createFullCampaign, activateCampaign, addNegativeKeywords, addLocationTargeting,
  setDeviceBidModifier, setAdScheduleBidModifier, setLocationBidModifier,
} from "@/lib/googleAdsClient";

export const maxDuration = 60;

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODEL = "gemini-2.0-flash";

// ── Groq fallback helpers (verbatim from tiktok-ads/ai/route.ts) ──────

function isBillingError(status: number, body: string): boolean {
  if (status === 402 || status === 529) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes("credit balance") ||
    lower.includes("billing") ||
    lower.includes("insufficient_quota") ||
    lower.includes("quota exceeded") ||
    lower.includes("rate limit") ||
    lower.includes("overloaded")
  );
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

async function getGoogleAdsCreds(uid: string): Promise<{ accessToken: string; customerId: string }> {
  const snap = await getAdminDb().collection("usuarios").doc(uid).get();
  const customerId = snap.data()?.googleAdsCustomerId as string | undefined;
  if (!customerId || !/^\d+$/.test(customerId)) {
    throw new Error("No hay Customer ID de Google Ads configurado.");
  }
  const accessToken = await getValidAccessToken(uid);
  return { accessToken, customerId };
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
  { name: "get_reporting", description: "Métricas por rango: LAST_7_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH.",
    input_schema: { type: "object" as const, properties: { date_range: { type: "string", enum: ["LAST_7_DAYS","LAST_30_DAYS","THIS_MONTH","LAST_MONTH"] } } } },
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
  { name: "create_search_campaign", description: "Crea una campaña de búsqueda COMPLETA en PAUSA (presupuesto+campaña+grupo+keywords+anuncio+ubicación). Genera tú las keywords y los textos del anuncio a partir del negocio.",
    input_schema: { type: "object" as const, properties: {
      campaign_name: { type: "string" }, daily_budget: { type: "number", description: "presupuesto diario en la moneda de la cuenta" },
      final_url: { type: "string" }, location_name: { type: "string", description: "ciudad para segmentar, ej. 'Querétaro'" },
      keywords: { type: "array", items: { type: "object", properties: { text: { type: "string" }, match_type: { type: "string", enum: ["EXACT","PHRASE","BROAD"] } }, required: ["text","match_type"] } },
      headlines: { type: "array", items: { type: "string" }, description: "10-15 títulos ≤30 chars" },
      descriptions: { type: "array", items: { type: "string" }, description: "3-4 descripciones ≤90 chars" },
    }, required: ["campaign_name","daily_budget","final_url","keywords","headlines","descriptions"] } },
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
  name: string, input: Record<string, unknown>, customerId: string, accessToken: string,
): Promise<string> {
  const dr = (input.date_range as string) || "LAST_7_DAYS";
  const campaignId = (input.campaign_id as string) || undefined;
  try {
    switch (name) {
      case "get_account_info":
        return JSON.stringify(await getAccountInfo(customerId, accessToken), null, 2);
      case "list_campaigns":
        return JSON.stringify(await getCampaigns(customerId, accessToken), null, 2);
      case "list_ad_groups":
        return JSON.stringify(await getAdGroups(customerId, accessToken, campaignId), null, 2);
      case "list_ads":
        return JSON.stringify(await getAds(customerId, accessToken, campaignId), null, 2);
      case "list_keywords":
        return JSON.stringify(await getKeywords(customerId, accessToken, campaignId), null, 2);
      case "get_reporting":
        return JSON.stringify(await getReporting(customerId, accessToken, dr), null, 2);
      case "get_budget":
        return JSON.stringify(await getAccountBudget(customerId, accessToken), null, 2);
      case "pause_campaign":
        await updateCampaignStatus(customerId, accessToken, input.campaign_resource_name as string, "PAUSED");
        return "Campaña pausada.";
      case "resume_campaign":
        await updateCampaignStatus(customerId, accessToken, input.campaign_resource_name as string, "ENABLED");
        return "Campaña reactivada.";
      case "update_campaign_budget": {
        const micros = Math.round((input.daily_amount as number) * 1_000_000);
        await updateCampaignBudget(customerId, accessToken, input.budget_resource_name as string, micros);
        return `Presupuesto actualizado a ${input.daily_amount}.`;
      }
      case "analyze_performance": {
        const rows = await getReporting(customerId, accessToken, dr);
        const t = rows.reduce((a, r) => ({ cost: a.cost + r.cost, clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions, conversions: a.conversions + r.conversions }), { cost: 0, clicks: 0, impressions: 0, conversions: 0 });
        const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
        const cpc = t.clicks > 0 ? t.cost / t.clicks : 0;
        return JSON.stringify({ period: dr, totals: { ...t, ctr: `${ctr.toFixed(2)}%`, cpc: cpc.toFixed(2) } }, null, 2);
      }
      case "get_hourly_performance": return JSON.stringify(await getHourlyPerformance(customerId, accessToken, dr), null, 2);
      case "get_device_performance": return JSON.stringify(await getDevicePerformance(customerId, accessToken, dr), null, 2);
      case "get_geo_performance": return JSON.stringify(await getGeoPerformance(customerId, accessToken, dr), null, 2);
      case "get_audience_performance": return JSON.stringify(await getAudiencePerformance(customerId, accessToken, dr), null, 2);
      case "get_extension_performance": return JSON.stringify(await getExtensionPerformance(customerId, accessToken, dr), null, 2);
      case "create_search_campaign": {
        const result = await createFullCampaign(customerId, accessToken, {
          campaignName: input.campaign_name as string,
          dailyBudgetMicros: Math.round(((input.daily_budget as number) || 0) * 1_000_000),
          startDate: new Date().toISOString().slice(0, 10).replace(/-/g, ""),
          targetCountry: "MX",
          adGroupName: `${input.campaign_name} - Grupo 1`,
          keywords: (input.keywords as Array<{ text: string; match_type: "EXACT"|"PHRASE"|"BROAD" }>).map((k) => ({ text: k.text, matchType: k.match_type })),
          adHeadlines: input.headlines as string[],
          adDescriptions: input.descriptions as string[],
          finalUrl: input.final_url as string,
        });
        let locationTargeted = false;
        if (input.location_name) locationTargeted = await addLocationTargeting(customerId, accessToken, result.campaignResourceName, input.location_name as string).catch(() => false);
        return JSON.stringify({
          ...result, status: "PAUSED", locationTargeted,
          note: locationTargeted
            ? "Campaña creada en PAUSA. Pide confirmación antes de activar."
            : "Campaña creada en PAUSA. ⚠️ No se pudo segmentar la ubicación automáticamente — dile al usuario que confirme el nombre exacto de la ciudad o que la configure en Google Ads. Pide confirmación antes de activar.",
        }, null, 2);
      }
      case "activate_campaign":
        await activateCampaign(customerId, accessToken, input.campaign_resource_name as string);
        return "Campaña ACTIVADA.";
      case "add_negative_keywords": {
        const added = await addNegativeKeywords(customerId, accessToken, input.campaign_resource_name as string, input.keywords as string[]);
        return `Agregadas ${added} keywords negativas.`;
      }
      case "set_device_bid_modifier": {
        const n = await setDeviceBidModifier(customerId, accessToken, input.campaign_resource_name as string, input.device as string, input.bid_modifier as number);
        return `Modificador de dispositivo aplicado a ${n} grupo(s).`;
      }
      case "set_ad_schedule_bid_modifier":
        await setAdScheduleBidModifier(customerId, accessToken, input.campaign_resource_name as string, { dayOfWeek: input.day_of_week as string, startHour: input.start_hour as number, endHour: input.end_hour as number }, input.bid_modifier as number);
        return "Modificador de horario aplicado.";
      case "set_location_bid_modifier":
        await setLocationBidModifier(customerId, accessToken, input.campaign_resource_name as string, input.location_name as string, input.bid_modifier as number);
        return "Modificador de ubicación aplicado.";
      default:
        return `Herramienta desconocida: ${name}`;
    }
  } catch (e) {
    return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ── System prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres el gestor de Google Ads de Indexa: ayudas a dueños de negocio SIN conocimientos de publicidad a crear y optimizar campañas hablando normal. SIEMPRE en español, simple, sin jerga (si usas un término técnico, explícalo en 1 línea).

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

═══ OPTIMIZAR ═══
- Diagnostica con get_reporting + get_hourly/device/geo/audience/extension_performance. Compara contra el promedio.
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

    let body: { message?: string; history?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo de solicitud inválido." }, { status: 400 });
    }

    const { message, history } = body;
    if (!message?.trim()) {
      return NextResponse.json({ error: "Faltan parámetros: message." }, { status: 400 });
    }

    let creds: { accessToken: string; customerId: string };
    try {
      creds = await getGoogleAdsCreds(user.uid);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Error al obtener credenciales de Google Ads." },
        { status: 400 }
      );
    }

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

    // Agentic loop — up to 8 rounds
    for (let round = 0; round < 8; round++) {
      let response: Record<string, unknown>;

      if (!useFallback) {
        const claudeRes = await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 1536,
            system: SYSTEM_PROMPT,
            tools,
            messages,
          }),
        });

        const claudeText = await claudeRes.text();

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
            tools: toGroqTools(tools),
            tool_choice: "auto",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              ...toGroqMessages(messages as AnthropicMessage[]),
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
        return NextResponse.json({
          reply: lastText,
          history: [
            ...(Array.isArray(history) ? history : []),
            { role: "user", content: message },
            { role: "assistant", content: lastText },
          ],
        });
      }

      if (response.stop_reason === "tool_use") {
        const content = (response.content as Record<string, unknown>[]) || [];
        const toolBlocks = content.filter((c) => c.type === "tool_use") as {
          type: string; id: string; name: string; input: Record<string, unknown>;
        }[];

        messages.push({ role: "assistant", content });

        const toolResults: { type: string; tool_use_id: string; content: string }[] = [];
        for (const block of toolBlocks) {
          const result = await executeTool(block.name, block.input, creds.customerId, creds.accessToken);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
        }

        messages.push({ role: "user", content: toolResults });
        continue;
      }

      break;
    }

    // Exhausted loop — return last captured text or fallback message
    const fallback = lastText || "No se pudo completar la solicitud. Intenta de nuevo.";
    return NextResponse.json({
      reply: fallback,
      history: [
        ...(Array.isArray(history) ? history : []),
        { role: "user", content: message },
        { role: "assistant", content: fallback },
      ],
    });

  } catch (err) {
    console.error("[google-ads/ai] unhandled error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error del asistente. Intenta de nuevo." }, { status: 400 });
  }
}
