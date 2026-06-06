# Google Ads Admin Interface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Google Ads management page to the admin panel (`/admin/campanas/google-ads`) with 5 tabs (Resumen, Campañas, Keywords, Anuncios, Asistente IA), mirroring the existing TikTok/Facebook admin pattern and reusing the existing Google Ads API/OAuth/client.

**Architecture:** A new client page consumes the existing `/api/google-ads` endpoints (read + pause/enable/update_budget). A new `/api/google-ads/ai` endpoint provides a tool-calling AI assistant (Claude primary, Groq/Gemini fallback) mapped to `googleAdsClient`. A nav item is added to the admin shell. No backend changes to existing routes.

**Tech Stack:** Next.js 16 (App Router, client components), React 19, Firebase Auth, recharts, lucide-react, Tailwind v4. AI via Anthropic Messages API with OpenAI-compatible Groq/Gemini fallback.

**Testing note:** This repo has NO unit-test infrastructure (no jest/vitest, no `test` script). Per the approved spec, verification for every task is `npm run build` (strict type-check + ESLint via `next build`) plus a manual checklist at the end. Do NOT scaffold a test framework.

**Spec:** `docs/superpowers/specs/2026-06-06-google-ads-admin-interface-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/app/admin/campanas/google-ads/page.tsx` (new) | Admin page: connect flow + 5 tabs, light admin theme |
| `src/app/api/google-ads/ai/route.ts` (new) | AI assistant agent: providers + tools + executor + loop |
| `src/app/admin/layout.tsx` (modify) | Add "Google Ads" nav item |

Reused unchanged: `src/app/api/google-ads/route.ts`, `src/app/dashboard/google-ads/GoogleAdsConnect.tsx`, `src/lib/googleAdsClient.ts`, `src/app/api/tokens/route.ts`.

**Key client types** (from `src/lib/googleAdsClient.ts`): `GoogleAdsCampaign { campaignId, campaignName, channelType, status, dailyBudget, dailyBudgetMicros, resourceName, budgetResourceName }`, `GoogleAdsKeyword { keywordId, text, matchType, qualityScore, status, resourceName }`, `GoogleAdsAd { adId, ... , status, resourceName }`, `GoogleAdsReportRow { date, cost, clicks, impressions, conversions }`, `GoogleAdsAccountInfo { descriptiveName, customerId, currencyCode }`.

**Reference templates:** dashboard page `src/app/dashboard/google-ads/page.tsx` (full Google Ads UI, dark theme); admin pattern `src/app/admin/campanas/tiktok/page.tsx` (light admin theme, tabs, AI chat); AI endpoint `src/app/api/tiktok-ads/ai/route.ts` (provider fallback + tool loop).

**Theme mapping (dark dashboard → light admin):** when adapting markup from the dashboard page, replace classes: `bg-[#0a0a0f]`→`bg-indexa-gray-light`; card `border-white/10 bg-white/[0.03]`→`border-gray-200 bg-white shadow-sm`; `text-white`→`text-indexa-gray-dark`; `text-white/40`/`text-white/50`→`text-gray-400`/`text-gray-500`; table head `text-white/40`→`text-gray-500`; row hover `hover:bg-white/[0.02]`→`hover:bg-gray-50`; divide `divide-white/5`→`divide-gray-100`. Keep Google blue accent `#4285F4`. Status pill colors stay (emerald/amber/red on light tints e.g. `bg-emerald-50 text-emerald-700`).

---

## Task 1: Add "Google Ads" nav item to the admin shell

**Files:**
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Import the `Target` icon**

In the `lucide-react` import block (currently ends with `Shield,`), add `Target`:

```tsx
import {
  LayoutDashboard, Users, UserSearch, Clock, Settings, LogOut, Menu, X,
  MessageSquare, Radar, Building2, Video, TrendingUp, Megaphone, Shield, Target,
} from "lucide-react";
```

- [ ] **Step 2: Add the nav entry**

In `NAV_ITEMS`, insert immediately after the Facebook line:

```tsx
  { href: "/admin/campanas/facebook", label: "Facebook Ads", icon: Megaphone },
  { href: "/admin/campanas/google-ads", label: "Google Ads", icon: Target },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings },
```

(Do NOT add it to `SUBADMIN_HREFS` — subadmins must not see it.)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exit 0, no type/lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "feat(admin): add Google Ads nav item"
```

---

## Task 2: AI endpoint — scaffold, providers, auth

**Files:**
- Create: `src/app/api/google-ads/ai/route.ts`

- [ ] **Step 1: Create the file with imports, provider config, fallback helpers, auth helper, and POST skeleton**

Copy the provider-fallback helpers verbatim from `src/app/api/tiktok-ads/ai/route.ts` (the four functions `isBillingError`, `toGroqTools`, `toGroqMessages`, `fromGroqResponse`, plus the `AnthropicMessage`/`AnthropicContent`/`GroqMessage` types and the `ANTHROPIC_URL`/`CLAUDE_MODEL`/`GROQ_URL`/`GROQ_MODEL`/`GEMINI_URL`/`GEMINI_MODEL` consts). They are provider-agnostic.

```tsx
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verifyAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { createRateLimiter } from "@/lib/rateLimit";
import {
  getValidAccessToken, getCampaigns, getAdGroups, getAds, getKeywords,
  getReporting, getAccountInfo, getAccountBudget,
  updateCampaignStatus, updateCampaignBudget,
} from "@/lib/googleAdsClient";

export const maxDuration = 60;

const limiter = createRateLimiter({ windowMs: 60_000, max: 30 });

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODEL = "gemini-2.0-flash";

// <-- paste isBillingError, AnthropicContent/Message, GroqMessage,
//     toGroqTools, toGroqMessages, fromGroqResponse from tiktok-ads/ai/route.ts here -->

async function getGoogleAdsCreds(uid: string): Promise<{ accessToken: string; customerId: string }> {
  const snap = await getAdminDb().collection("usuarios").doc(uid).get();
  const customerId = snap.data()?.googleAdsCustomerId as string | undefined;
  if (!customerId || !/^\d+$/.test(customerId)) {
    throw new Error("No hay Customer ID de Google Ads configurado.");
  }
  const accessToken = await getValidAccessToken(uid);
  return { accessToken, customerId };
}
```

- [ ] **Step 2: Verify build**

The file will not export a handler yet — add a temporary `export async function POST() { return NextResponse.json({ ok: true }); }` at the end so the route compiles, then:

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/google-ads/ai/route.ts
git commit -m "feat(google-ads): scaffold AI endpoint (providers + auth)"
```

---

## Task 3: AI endpoint — tools + executor

**Files:**
- Modify: `src/app/api/google-ads/ai/route.ts`

- [ ] **Step 1: Define the `tools` array** (insert above the POST handler)

```tsx
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
  { name: "pause_campaign", description: "Pausa una campaña (requiere campaignResourceName).",
    input_schema: { type: "object" as const, properties: { campaign_resource_name: { type: "string" } }, required: ["campaign_resource_name"] } },
  { name: "resume_campaign", description: "Reactiva una campaña pausada (requiere campaignResourceName).",
    input_schema: { type: "object" as const, properties: { campaign_resource_name: { type: "string" } }, required: ["campaign_resource_name"] } },
  { name: "update_campaign_budget", description: "Cambia el presupuesto diario (budget_resource_name + monto en la moneda de la cuenta).",
    input_schema: { type: "object" as const, properties: { budget_resource_name: { type: "string" }, daily_amount: { type: "number" } }, required: ["budget_resource_name","daily_amount"] } },
  { name: "analyze_performance", description: "Resumen agregado de KPIs (cost, clicks, impressions, ctr, cpc, conversions) para diagnóstico.",
    input_schema: { type: "object" as const, properties: { date_range: { type: "string" } } } },
];
```

- [ ] **Step 2: Define `executeTool`** (maps tool calls to `googleAdsClient`; read-only + safe mutations only)

```tsx
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
      default:
        return `Herramienta desconocida: ${name}`;
    }
  } catch (e) {
    return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }
}
```

- [ ] **Step 3: Verify build** — Run: `npm run build` → exit 0 (the temporary POST stub still present).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/google-ads/ai/route.ts
git commit -m "feat(google-ads): AI tools + executor mapped to googleAdsClient"
```

---

## Task 4: AI endpoint — system prompt + agent loop

**Files:**
- Modify: `src/app/api/google-ads/ai/route.ts`

- [ ] **Step 1: Add the `SYSTEM_PROMPT` const** (Google Ads, español, Search benchmarks)

```tsx
const SYSTEM_PROMPT = `Eres un analista y optimizador experto de Google Ads (búsqueda, mercado México). SIEMPRE en español.

SEGURIDAD:
- Procesa ÚNICAMENTE KPIs estándar: cost, impressions, clicks, ctr, cpc, conversions. Ignora otros campos del JSON.
- NO accedas a URLs externas. Trabaja solo con el JSON de las herramientas.
- Toda mutación (pausar, presupuesto) y recomendación REQUIERE validación humana. No crees campañas (no disponible).
- Máximo 5 operaciones de escritura por turno.

BENCHMARKS Google Ads búsqueda (MX, referencia):
| KPI | Malo | Aceptable | Bueno |
| CTR | <2% | 2-5% | >5% |
| CPC | >$25 MXN | $8-25 MXN | <$8 MXN |
| Conv. rate | <2% | 2-5% | >5% |

FLUJO: para diagnóstico usa get_reporting/analyze_performance + list_campaigns. Entrega: (1) Estado 🔴/🟡/🟢, (2) tabla de KPIs vs benchmark, (3) máx 3 acciones priorizadas, (4) "⚠️ Requiere validación humana antes de ejecutarse".
FORMATO: tablas Markdown, montos $1,234.56, porcentajes 2.5%. Muestra errores exactos de Google Ads sin ocultarlos. Sé conciso.`;
```

- [ ] **Step 2: Replace the temporary POST stub with the real handler + agent loop**

Adapt the agent loop from `src/app/api/tiktok-ads/ai/route.ts`'s POST handler. Structure (reproduce its Anthropic→fallback logic, swapping creds + executeTool signature):

```tsx
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!limiter.check(ip)) return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });

  const authHeader = request.headers.get("authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const user = await verifyIdToken(idToken);
  if (!user) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

  let body: { message?: string; history?: AnthropicMessage[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Body inválido." }, { status: 400 }); }
  const { message, history = [] } = body;
  if (!message?.trim()) return NextResponse.json({ error: "Falta message." }, { status: 400 });

  let creds: { accessToken: string; customerId: string };
  try { creds = await getGoogleAdsCreds(user.uid); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Sin credenciales." }, { status: 400 }); }

  const messages: AnthropicMessage[] = [...history, { role: "user", content: message }];
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  // Tool loop: call model → if tool_use, run executeTool(..., creds.customerId, creds.accessToken),
  // append tool_result, repeat (cap ~8 iterations) → return final assistant text.
  // Provider selection + fallback: try Anthropic; on isBillingError(status, body) fall back to Groq
  // (toGroqTools/toGroqMessages/fromGroqResponse) then Gemini. Mirror tiktok-ads/ai exactly,
  // replacing SYSTEM_PROMPT, tools, and the executeTool call signature.
  // On success return: NextResponse.json({ reply: <final text>, history: messages }).

  // ... (paste & adapt the loop body from tiktok-ads/ai/route.ts POST handler) ...
}
```

Notes for the implementer adapting the loop:
- The tiktok handler's `executeTool(name, input, creds)` becomes `executeTool(name, input, creds.customerId, creds.accessToken)`.
- Keep the iteration cap and the billing-error fallback chain identical.
- Final response shape consumed by the page (Task 8): `{ reply: string, history: AnthropicMessage[] }`.

- [ ] **Step 3: Verify build** — Run: `npm run build` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/google-ads/ai/route.ts
git commit -m "feat(google-ads): AI agent loop with provider fallback"
```

---

## Task 5: Admin page — scaffold (connect + header + tab shell)

**Files:**
- Create: `src/app/admin/campanas/google-ads/page.tsx`

- [ ] **Step 1: Create the page** by adapting `src/app/dashboard/google-ads/page.tsx` with these concrete changes:
  - `"use client"`. Keep imports: `useState/useCallback/useEffect`, `useAuth`, `doc/getDoc`, `db`, recharts, lucide icons, `GoogleAdsConnect`, and the `GoogleAds*` types. ADD `MessageSquare, Send` icons for the AI tab.
  - **Remove** the paywall logic (`PaywallOverlay/PaywallModal`, `requireActive`, `isActive`, `sitio/sitioId`) — admin has no paywall. The connect/data flow stays.
  - Extend `type Tab` to `"resumen" | "campanas" | "keywords" | "anuncios" | "ia"`.
  - Add state for ads + AI: `const [ads, setAds] = useState<GoogleAdsAd[]>([])`, `const [aiHistory, setAiHistory] = useState<{role:"user"|"assistant";content:string}[]>([])`, `const [aiInput, setAiInput] = useState("")`, `const [aiLoading, setAiLoading] = useState(false)`.
  - Keep `apiFetch`, `apiPost`, `loadData`, `loadKeywords`, `toggleCampaign`, the reporting aggregation, `fmtMoney/fmtNum/campaignStatusLabel/matchTypeLabel`, `DATE_RANGES` unchanged (they call the same `/api/google-ads`).
  - Connect-load: keep the `/api/tokens` `{action:"load"}` → `setCustomerId(tokens.googleAdsCustomerId)` effect; drop the sitio/profile load.
  - **Re-theme** every wrapper using the "Theme mapping" table in the File Structure section (dark → light). Page wrapper: replace `min-h-screen bg-[#0a0a0f] px-4 py-8` with `space-y-6` (the admin layout already provides padding + light bg).
  - **Not-connected** state: a light card (`rounded-2xl border border-gray-200 bg-white p-8 shadow-sm text-center`) containing the heading + `<GoogleAdsConnect onConnected={async () => { /* reload customerId from /api/tokens, same as dashboard */ }} />`. Remove the paywall branch.
  - Header: drop the `<Link href="/dashboard">` back-chevron (admin has its own nav). Keep account info + date-range select + Actualizar + external Google Ads link, re-themed to light.
  - Tab switcher: render 5 tabs; labels — `resumen`→"Resumen", `campanas`→"Campañas", `keywords`→"Palabras clave", `anuncios`→"Anuncios", `ia`→"Asistente IA". Re-theme the pill container to light (`border-gray-200 bg-white`).
  - For this task, render only the **Resumen** tab body (adapt from dashboard) and leave the other tab bodies as empty `{tab === "..." && null}` placeholders to be filled in Tasks 6-8. (This keeps the task self-contained and buildable.)

- [ ] **Step 2: Add an `ads` loader** (used in Task 7) — define now so the effect wiring is in place:

```tsx
const loadAds = useCallback(async () => {
  if (!isConnected) return;
  setLoading(true);
  try {
    const data = await apiFetch("ads");
    if (data?.ads) setAds(data.ads);
  } catch (e) { setError(e instanceof Error ? e.message : "Error al cargar anuncios."); }
  finally { setLoading(false); }
}, [isConnected, apiFetch]);

useEffect(() => { if (tab === "anuncios" && isConnected) loadAds(); }, [tab, isConnected, loadAds]);
```

- [ ] **Step 3: Verify build** — Run: `npm run build` → exit 0. Expect the page to compile with Resumen rendering and other tabs empty.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/campanas/google-ads/page.tsx
git commit -m "feat(admin): Google Ads page scaffold + Resumen tab"
```

---

## Task 6: Admin page — Campañas tab (pause/activate + edit budget)

**Files:**
- Modify: `src/app/admin/campanas/google-ads/page.tsx`

- [ ] **Step 1: Add budget-edit state + handler**

```tsx
const [editingBudget, setEditingBudget] = useState<string | null>(null); // campaignId
const [budgetInput, setBudgetInput] = useState("");

const saveBudget = useCallback(async (c: GoogleAdsCampaign) => {
  const amount = parseFloat(budgetInput);
  if (!Number.isFinite(amount) || amount <= 0) { setError("Presupuesto inválido."); return; }
  setActionLoading(c.campaignId);
  try {
    await apiPost({ action: "update_budget", budgetResourceName: c.budgetResourceName, amountMicros: Math.round(amount * 1_000_000) });
    setCampaigns((prev) => prev.map((x) => x.campaignId === c.campaignId ? { ...x, dailyBudget: amount, dailyBudgetMicros: Math.round(amount * 1_000_000) } : x));
    setEditingBudget(null);
  } catch (e) { setError(e instanceof Error ? e.message : "Error al actualizar presupuesto."); }
  finally { setActionLoading(null); }
}, [apiPost, budgetInput]);
```

- [ ] **Step 2: Render the Campañas tab body** (adapt the dashboard campaigns table to light theme; make the budget cell editable)

Adapt from dashboard `page.tsx` lines ~423-481 with the theme mapping. Replace the static budget cell with an editable one:

```tsx
<td className="px-4 py-3 text-right text-indexa-gray-dark">
  {editingBudget === c.campaignId ? (
    <span className="inline-flex items-center gap-1">
      <input type="number" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)}
        className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm" autoFocus />
      <button onClick={() => saveBudget(c)} disabled={actionLoading === c.campaignId}
        className="rounded-lg bg-[#4285F4] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">Guardar</button>
      <button onClick={() => setEditingBudget(null)} className="text-gray-400 hover:text-gray-600 text-xs">Cancelar</button>
    </span>
  ) : (
    <button onClick={() => { setEditingBudget(c.campaignId); setBudgetInput(String(c.dailyBudget)); }}
      className="rounded-lg px-2 py-1 hover:bg-gray-100" title="Editar presupuesto">
      {fmtMoney(c.dailyBudget, currency)}
    </button>
  )}
</td>
```

Keep the pause/activate button (`toggleCampaign`) but re-themed to light (`border-gray-200 text-gray-600 hover:bg-gray-50`). Drop the `requireActive` wrapper (no paywall) — call `toggleCampaign(c)` directly.

- [ ] **Step 3: Verify build** — Run: `npm run build` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/campanas/google-ads/page.tsx
git commit -m "feat(admin): Google Ads Campañas tab with budget editing"
```

---

## Task 7: Admin page — Keywords + Anuncios tabs

**Files:**
- Modify: `src/app/admin/campanas/google-ads/page.tsx`

- [ ] **Step 1: Render the Keywords tab** — adapt the dashboard keywords table (lines ~484-538) to light theme. Logic (`loadKeywords` effect, `matchTypeLabel`, quality-score color) is unchanged; only re-theme classes. Quality-score colors on light: `text-emerald-600 / text-amber-600 / text-red-600`.

- [ ] **Step 2: Render the Anuncios tab** — a real table fed by `ads` (loaded in Task 5's `loadAds`). Use the `GoogleAdsAd` fields (verify exact names in `src/lib/googleAdsClient.ts`: `adId`, `status`, headline/text field, plus `resourceName`). Columns: Anuncio (headline/text), Estado, ID.

```tsx
{tab === "anuncios" && (
  <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
    <table className="w-full text-sm">
      <thead><tr className="border-b border-gray-200 bg-gray-50">
        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Anuncio</th>
        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Estado</th>
        <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">ID</th>
      </tr></thead>
      <tbody className="divide-y divide-gray-100">
        {ads.length === 0 && (<tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">{loading ? "Cargando anuncios…" : "No hay anuncios."}</td></tr>)}
        {ads.map((a) => {
          const s = campaignStatusLabel(a.status);
          return (
            <tr key={a.adId} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-indexa-gray-dark">{/* headline/text field from GoogleAdsAd */}</td>
              <td className="px-4 py-3"><span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.bg} ${s.color}`}>{s.text}</span></td>
              <td className="px-4 py-3 text-right text-xs text-gray-400">{a.adId}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
)}
```

Update `campaignStatusLabel` (or add a light variant) so `bg`/`color` use light tints: ENABLED→`bg-emerald-50 text-emerald-700`, PAUSED→`bg-amber-50 text-amber-700`, REMOVED→`bg-gray-100 text-gray-400`.

- [ ] **Step 3: Verify build** — Run: `npm run build` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/campanas/google-ads/page.tsx
git commit -m "feat(admin): Google Ads Keywords + Anuncios tabs"
```

---

## Task 8: Admin page — Asistente IA tab (chat)

**Files:**
- Modify: `src/app/admin/campanas/google-ads/page.tsx`

- [ ] **Step 1: Add the send handler**

```tsx
const sendAi = useCallback(async () => {
  if (!user || !aiInput.trim() || aiLoading) return;
  const userMsg = aiInput.trim();
  setAiInput("");
  setAiHistory((h) => [...h, { role: "user", content: userMsg }]);
  setAiLoading(true);
  try {
    const idToken = await user.getIdToken();
    const res = await fetch("/api/google-ads/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ message: userMsg, history: aiHistory.map((m) => ({ role: m.role, content: m.content })) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error del asistente.");
    setAiHistory((h) => [...h, { role: "assistant", content: data.reply ?? "" }]);
  } catch (e) {
    setAiHistory((h) => [...h, { role: "assistant", content: `⚠️ ${e instanceof Error ? e.message : "Error"}` }]);
  } finally { setAiLoading(false); }
}, [user, aiInput, aiLoading, aiHistory]);
```

- [ ] **Step 2: Render the IA tab** (light chat; AI text via `whitespace-pre-wrap` — markdown tables render as preformatted text in v1)

```tsx
{tab === "ia" && (
  <div className="flex flex-col rounded-2xl border border-gray-200 bg-white" style={{ height: "60vh" }}>
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      {aiHistory.length === 0 && (<p className="text-center text-sm text-gray-400 mt-8">Pregúntame: "analiza el rendimiento de mis campañas" o "qué optimizo esta semana".</p>)}
      {aiHistory.map((m, i) => (
        <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-[#4285F4] text-white" : "bg-gray-100 text-indexa-gray-dark"}`}>{m.content}</div>
        </div>
      ))}
      {aiLoading && (<div className="flex justify-start"><div className="rounded-2xl bg-gray-100 px-4 py-2.5"><Loader2 size={16} className="animate-spin text-gray-400" /></div></div>)}
    </div>
    <div className="flex gap-2 border-t border-gray-200 p-3">
      <input value={aiInput} onChange={(e) => setAiInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAi(); } }}
        placeholder="Pregunta sobre tus campañas…" disabled={aiLoading}
        className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-[#4285F4]" />
      <button onClick={sendAi} disabled={aiLoading || !aiInput.trim()}
        className="flex items-center gap-1.5 rounded-xl bg-[#4285F4] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        <Send size={15} /> Enviar
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Verify build** — Run: `npm run build` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/campanas/google-ads/page.tsx
git commit -m "feat(admin): Google Ads AI assistant tab"
```

---

## Task 9: Final verification (build + manual checklist)

**Files:** none (verification only)

- [ ] **Step 1: Full production build** — Run: `npm run build` → exit 0, no errors. Confirm `/admin/campanas/google-ads` appears in the route list.

- [ ] **Step 2: Manual checklist** (dev server `npm run dev`, logged in as admin, Google Ads account connected — requires Google Ads creds configured per the migration):
  - Nav shows "Google Ads"; route loads.
  - Not connected → connect card with OAuth popup; after connect, account info appears.
  - Resumen: KPIs + spend chart render; date-range select reloads.
  - Campañas: list loads; pause/activate toggles; edit budget saves and reflects.
  - Keywords: list loads with quality score.
  - Anuncios: list loads (real ads).
  - Asistente IA: send "analiza mi rendimiento" → streamed/returned diagnosis with KPI table; provider fallback works if Anthropic billing errors.

- [ ] **Step 3: Commit any final tweaks** found during manual testing (per-issue commits).

---

## Self-Review (completed by plan author)

- **Spec coverage:** Tabs Resumen/Campañas/Keywords/Anuncios/IA → Tasks 5-8 ✓. Budget edit → Task 6 ✓. Real ads → Task 7 ✓. AI endpoint (providers/tools/loop, no create_campaign) → Tasks 2-4 ✓. Nav item → Task 1 ✓. Reuse API/OAuth/client ✓. Light theme mapping ✓. Verification by build+manual (no test infra) ✓.
- **Placeholders:** Mirror-UI steps reference exact template files + line ranges + explicit class deltas (not vague). The one runtime detail to verify in source — `GoogleAdsAd` headline/text field name — is flagged explicitly in Task 7 Step 2.
- **Type consistency:** `update_budget` POST uses `{ budgetResourceName, amountMicros }` (matches existing `/api/google-ads` POST). AI response shape `{ reply, history }` consumed identically in Task 8. `Tab` union extended consistently across Tasks 5-8.
