# Google Ads Conversational Manager (Fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Google Ads AI assistant a conversational manager for non-experts: it creates full search campaigns (in PAUSED) from a plain-language description, analyzes performance across 5 segments, adds negative keywords, and activates/optimizes with confirmation.

**Architecture:** Extend `googleAdsClient` with segment GAQL queries + write helpers (activate, negative keywords, location targeting). Expose them via the existing `/api/google-ads` (GET reads, POST writes) and as tools in `/api/google-ads/ai`, with a rewritten system prompt. Add a "Segmentos" tab to the admin page. All creation lands PAUSED; activation/budget-increase require explicit confirmation.

**Tech Stack:** Next.js 16 (App Router), React 19, Firebase, Google Ads REST API v22 (via existing `gaqlSearch`/`gaqlMutate` helpers), Anthropic/Groq/Gemini for the agent.

**Testing note:** This repo has NO unit-test infrastructure (no jest/vitest, no `test` script). Per the spec, per-task verification is `npx tsc --noEmit` (fast) and the FINAL task runs `npm run build` (full type+lint) + a manual checklist. Do NOT scaffold a test framework.

**Spec:** `docs/superpowers/specs/2026-06-06-google-ads-conversational-manager-fase1-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/googleAdsClient.ts` (modify) | 5 segment query fns + types + geo name resolver; write helpers `activateCampaign`, `addNegativeKeywords`, `addLocationTargeting` |
| `src/app/api/google-ads/route.ts` (modify) | GET actions (hourly/device/geo/audiences/extensions); POST actions (create_search_campaign, activate, add_negative_keywords) |
| `src/app/api/google-ads/ai/route.ts` (modify) | New AI tools + executeTool cases + rewritten SYSTEM_PROMPT |
| `src/app/admin/campanas/google-ads/page.tsx` (modify) | "Segmentos" tab with 5 sub-views |

**Reused (unchanged):** `gaqlSearch`, `gaqlMutate`, `getDateRange`, `microsToUnit`, `getValidAccessToken`, `createFullCampaign` (already creates PAUSED), `CreateCampaignParams`/`CreateCampaignResult`.

**Existing patterns to read before coding:** `getReporting` (GAQL read pattern, ~line 567), `createFullCampaign` (gaqlMutate pattern, ~line 735), `updateCampaignStatus` (~line 697), the GET/POST switches in `api/google-ads/route.ts`, and the tool/executeTool/agent-loop in `api/google-ads/ai/route.ts`.

---

## Task 1: Segment queries — hourly + device

**Files:** Modify `src/lib/googleAdsClient.ts`

- [ ] **Step 1: Add row types** (near the other `GoogleAds*` interfaces)

```ts
export interface GoogleAdsHourlyRow { hour: number; dayOfWeek: string; cost: number; clicks: number; impressions: number; conversions: number; ctr: number; avgCpc: number; }
export interface GoogleAdsDeviceRow { device: string; cost: number; clicks: number; impressions: number; conversions: number; ctr: number; avgCpc: number; }
```

- [ ] **Step 2: Add `getHourlyPerformance`** (follow the exact shape of `getReporting`: typed `Row`, `gaqlSearch`, `getDateRange`, `microsToUnit`)

```ts
export async function getHourlyPerformance(customerId: string, accessToken: string, dateRange: string): Promise<GoogleAdsHourlyRow[]> {
  type Row = { segments: { hour: number; dayOfWeek: string }; metrics: { costMicros: string; clicks: string; impressions: string; conversions: string; ctr: string; averageCpc: string } };
  const { startDate, endDate } = getDateRange(dateRange);
  const rows = await gaqlSearch<Row>(customerId, accessToken,
    `SELECT segments.hour, segments.day_of_week, metrics.cost_micros, metrics.clicks,
            metrics.impressions, metrics.conversions, metrics.ctr, metrics.average_cpc
     FROM campaign
     WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND campaign.status != 'REMOVED'`);
  return rows.map((r) => ({
    hour: Number(r.segments.hour ?? 0), dayOfWeek: r.segments.dayOfWeek ?? "",
    cost: microsToUnit(r.metrics.costMicros ?? 0), clicks: Number(r.metrics.clicks ?? 0),
    impressions: Number(r.metrics.impressions ?? 0), conversions: Number(r.metrics.conversions ?? 0),
    ctr: Number(r.metrics.ctr ?? 0), avgCpc: microsToUnit(r.metrics.averageCpc ?? 0),
  }));
}
```

- [ ] **Step 3: Add `getDevicePerformance`** (same pattern, `segments.device`)

```ts
export async function getDevicePerformance(customerId: string, accessToken: string, dateRange: string): Promise<GoogleAdsDeviceRow[]> {
  type Row = { segments: { device: string }; metrics: { costMicros: string; clicks: string; impressions: string; conversions: string; ctr: string; averageCpc: string } };
  const { startDate, endDate } = getDateRange(dateRange);
  const rows = await gaqlSearch<Row>(customerId, accessToken,
    `SELECT segments.device, metrics.cost_micros, metrics.clicks, metrics.impressions,
            metrics.conversions, metrics.ctr, metrics.average_cpc
     FROM campaign
     WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND campaign.status != 'REMOVED'`);
  return rows.map((r) => ({
    device: r.segments.device ?? "UNKNOWN", cost: microsToUnit(r.metrics.costMicros ?? 0),
    clicks: Number(r.metrics.clicks ?? 0), impressions: Number(r.metrics.impressions ?? 0),
    conversions: Number(r.metrics.conversions ?? 0), ctr: Number(r.metrics.ctr ?? 0),
    avgCpc: microsToUnit(r.metrics.averageCpc ?? 0),
  }));
}
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 5: Commit** — `git add src/lib/googleAdsClient.ts && git commit -m "feat(google-ads): hourly + device segment queries"`

---

## Task 2: Segment queries — geo (with name resolution), audiences, extensions

**Files:** Modify `src/lib/googleAdsClient.ts`

> These three resources have API nuances. Provide the queries below; if the live API rejects a field name, adjust to the closest valid field and **degrade gracefully** (return the rows you can; never throw for a missing optional field). Verify against the connected account during the manual test in Task 8.

- [ ] **Step 1: Add types**

```ts
export interface GoogleAdsGeoRow { locationId: string; locationName: string; cost: number; clicks: number; conversions: number; }
export interface GoogleAdsAudienceRow { name: string; type: string; cost: number; clicks: number; conversions: number; }
export interface GoogleAdsExtensionRow { assetId: string; type: string; name: string; cost: number; clicks: number; impressions: number; }
```

- [ ] **Step 2: Add `getGeoPerformance`** (2 steps: data, then resolve names for top 25 by cost)

```ts
export async function getGeoPerformance(customerId: string, accessToken: string, dateRange: string): Promise<GoogleAdsGeoRow[]> {
  type Row = { geographicView: { countryCriterionId?: string }; segments?: { geoTargetRegion?: string; geoTargetCity?: string }; metrics: { costMicros: string; clicks: string; conversions: string } };
  const { startDate, endDate } = getDateRange(dateRange);
  const rows = await gaqlSearch<Row>(customerId, accessToken,
    `SELECT segments.geo_target_city, segments.geo_target_region,
            metrics.cost_micros, metrics.clicks, metrics.conversions
     FROM geographic_view
     WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`);
  // location resource name is like "geoTargetConstants/1010044"; collect + resolve names
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
    const names = await gaqlSearch<NameRow>(customerId, accessToken,
      `SELECT geo_target_constant.id, geo_target_constant.name
       FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${resourceNames})`).catch(() => []);
    const map = new Map(names.map((n) => [String(n.geoTargetConstant.id), n.geoTargetConstant.name]));
    for (const r of out) r.locationName = map.get(r.locationId) || r.locationId;
  }
  return out.sort((a, b) => b.cost - a.cost);
}
```

- [ ] **Step 3: Add `getAudiencePerformance`**

```ts
export async function getAudiencePerformance(customerId: string, accessToken: string, dateRange: string): Promise<GoogleAdsAudienceRow[]> {
  type Row = { adGroupCriterion?: { type?: string; displayName?: string }; metrics: { costMicros: string; clicks: string; conversions: string } };
  const { startDate, endDate } = getDateRange(dateRange);
  const rows = await gaqlSearch<Row>(customerId, accessToken,
    `SELECT ad_group_criterion.type, ad_group_criterion.display_name,
            metrics.cost_micros, metrics.clicks, metrics.conversions
     FROM ad_group_audience_view
     WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`).catch(() => []);
  return rows.map((r) => ({
    name: r.adGroupCriterion?.displayName || "(audiencia)", type: r.adGroupCriterion?.type || "",
    cost: microsToUnit(r.metrics.costMicros ?? 0), clicks: Number(r.metrics.clicks ?? 0),
    conversions: Number(r.metrics.conversions ?? 0),
  }));
}
```

- [ ] **Step 4: Add `getExtensionPerformance`**

```ts
export async function getExtensionPerformance(customerId: string, accessToken: string, dateRange: string): Promise<GoogleAdsExtensionRow[]> {
  type Row = { asset?: { id?: string; type?: string; name?: string }; metrics: { costMicros: string; clicks: string; impressions: string } };
  const { startDate, endDate } = getDateRange(dateRange);
  const rows = await gaqlSearch<Row>(customerId, accessToken,
    `SELECT asset.id, asset.type, asset.name, metrics.cost_micros, metrics.clicks, metrics.impressions
     FROM campaign_asset
     WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND campaign_asset.status != 'REMOVED'`).catch(() => []);
  return rows.map((r) => ({
    assetId: r.asset?.id || "", type: r.asset?.type || "", name: r.asset?.name || "",
    cost: microsToUnit(r.metrics.costMicros ?? 0), clicks: Number(r.metrics.clicks ?? 0),
    impressions: Number(r.metrics.impressions ?? 0),
  }));
}
```

- [ ] **Step 5: Verify** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 6: Commit** — `git commit -am "feat(google-ads): geo (name-resolved) + audience + extension segment queries"`

---

## Task 3: Write helpers — activate, negative keywords, location targeting

**Files:** Modify `src/lib/googleAdsClient.ts`

- [ ] **Step 1: Add `activateCampaign`** (read the campaign's ad groups + ads, set all three to ENABLED via `gaqlMutate`)

```ts
export async function activateCampaign(customerId: string, accessToken: string, campaignResourceName: string): Promise<void> {
  const campaignId = extractId(campaignResourceName);
  type AdGroupRow = { adGroup: { resourceName: string } };
  type AdRow = { adGroupAd: { resourceName: string } };
  const adGroups = await gaqlSearch<AdGroupRow>(customerId, accessToken,
    `SELECT ad_group.resource_name FROM ad_group WHERE campaign.id = ${campaignId} AND ad_group.status = 'PAUSED'`);
  const ads = await gaqlSearch<AdRow>(customerId, accessToken,
    `SELECT ad_group_ad.resource_name FROM ad_group_ad WHERE campaign.id = ${campaignId} AND ad_group_ad.status = 'PAUSED'`);
  await gaqlMutate(customerId, accessToken, "campaigns",
    [{ updateMask: "status", update: { resourceName: campaignResourceName, status: "ENABLED" } }]);
  if (adGroups.length) await gaqlMutate(customerId, accessToken, "adGroups",
    adGroups.map((g) => ({ updateMask: "status", update: { resourceName: g.adGroup.resourceName, status: "ENABLED" } })));
  if (ads.length) await gaqlMutate(customerId, accessToken, "adGroupAds",
    ads.map((a) => ({ updateMask: "status", update: { resourceName: a.adGroupAd.resourceName, status: "ENABLED" } })));
}
```

- [ ] **Step 2: Add `addNegativeKeywords`** (campaign-level negative criteria — applies to the whole campaign)

```ts
export async function addNegativeKeywords(customerId: string, accessToken: string, campaignResourceName: string, keywords: string[]): Promise<number> {
  const ops = keywords.filter((k) => k.trim()).map((text) => ({
    create: { campaign: campaignResourceName, negative: true, keyword: { text: text.trim(), matchType: "BROAD" } },
  }));
  if (!ops.length) return 0;
  await gaqlMutate(customerId, accessToken, "campaignCriteria", ops);
  return ops.length;
}
```

- [ ] **Step 3: Add `addLocationTargeting`** (resolve a location name → geo_target_constant, add a campaign location criterion)

```ts
export async function addLocationTargeting(customerId: string, accessToken: string, campaignResourceName: string, locationName: string): Promise<void> {
  if (!locationName?.trim()) return;
  type GeoRow = { geoTargetConstant: { resourceName: string } };
  const matches = await gaqlSearch<GeoRow>(customerId, accessToken,
    `SELECT geo_target_constant.resource_name FROM geo_target_constant
     WHERE geo_target_constant.name = '${locationName.replace(/'/g, "")}'
       AND geo_target_constant.status = 'ENABLED' AND geo_target_constant.target_type = 'City' LIMIT 1`).catch(() => []);
  const geo = matches[0]?.geoTargetConstant?.resourceName;
  if (!geo) return; // degrade gracefully: no location targeting if not resolvable
  await gaqlMutate(customerId, accessToken, "campaignCriteria",
    [{ create: { campaign: campaignResourceName, location: { geoTargetConstant: geo } } }]);
}
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 5: Commit** — `git commit -am "feat(google-ads): activate, negative-keyword, and location-targeting write helpers"`

---

## Task 4: API route — GET segment actions + POST write actions

**Files:** Modify `src/app/api/google-ads/route.ts`

- [ ] **Step 1: Import the new client functions** (extend the existing import from `@/lib/googleAdsClient`)

Add: `getHourlyPerformance, getDevicePerformance, getGeoPerformance, getAudiencePerformance, getExtensionPerformance, activateCampaign, addNegativeKeywords, addLocationTargeting`.

- [ ] **Step 2: Add GET cases** (in the GET `switch (action)`, same pattern as existing `reporting`)

```ts
case "hourly":   return NextResponse.json({ rows: await getHourlyPerformance(customerId, accessToken, dateRange) });
case "device":   return NextResponse.json({ rows: await getDevicePerformance(customerId, accessToken, dateRange) });
case "geo":      return NextResponse.json({ rows: await getGeoPerformance(customerId, accessToken, dateRange) });
case "audiences":return NextResponse.json({ rows: await getAudiencePerformance(customerId, accessToken, dateRange) });
case "extensions":return NextResponse.json({ rows: await getExtensionPerformance(customerId, accessToken, dateRange) });
```

- [ ] **Step 3: Add POST cases** (in the POST handler, after the existing `update_budget`/`create_campaign` blocks)

```ts
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
```

(The existing `create_campaign` POST already calls `createFullCampaign`; in Task 6 the AI will call it then `addLocationTargeting` + report PAUSED. If `create_campaign` returns the campaign resource name, expose it in the response so the AI can chain location targeting/activation.)

- [ ] **Step 4: Verify** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 5: Commit** — `git commit -am "feat(google-ads): API GET segment actions + POST activate/negative-keywords"`

---

## Task 5: AI endpoint — segment tools

**Files:** Modify `src/app/api/google-ads/ai/route.ts`

- [ ] **Step 1: Import the 5 segment client fns** (extend the existing `@/lib/googleAdsClient` import).

- [ ] **Step 2: Add 5 tools to the `tools` array**

```ts
{ name: "get_hourly_performance", description: "Rendimiento por hora del día y día de semana (para modificadores de horario).", input_schema: { type: "object" as const, properties: { date_range: { type: "string" } } } },
{ name: "get_device_performance", description: "Rendimiento por dispositivo (MOBILE/DESKTOP/TABLET).", input_schema: { type: "object" as const, properties: { date_range: { type: "string" } } } },
{ name: "get_geo_performance", description: "Rendimiento por ubicación (ciudad/región, con nombres).", input_schema: { type: "object" as const, properties: { date_range: { type: "string" } } } },
{ name: "get_audience_performance", description: "Rendimiento por audiencia.", input_schema: { type: "object" as const, properties: { date_range: { type: "string" } } } },
{ name: "get_extension_performance", description: "Rendimiento de extensiones/assets.", input_schema: { type: "object" as const, properties: { date_range: { type: "string" } } } },
```

- [ ] **Step 3: Add the 5 cases to `executeTool`** (all read-only, same shape as existing `get_reporting`)

```ts
case "get_hourly_performance": return JSON.stringify(await getHourlyPerformance(customerId, accessToken, dr), null, 2);
case "get_device_performance": return JSON.stringify(await getDevicePerformance(customerId, accessToken, dr), null, 2);
case "get_geo_performance": return JSON.stringify(await getGeoPerformance(customerId, accessToken, dr), null, 2);
case "get_audience_performance": return JSON.stringify(await getAudiencePerformance(customerId, accessToken, dr), null, 2);
case "get_extension_performance": return JSON.stringify(await getExtensionPerformance(customerId, accessToken, dr), null, 2);
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 5: Commit** — `git commit -am "feat(google-ads): AI segment analysis tools"`

---

## Task 6: AI endpoint — create/activate/negative tools + system prompt rewrite

**Files:** Modify `src/app/api/google-ads/ai/route.ts`

- [ ] **Step 1: Import** `createFullCampaign, activateCampaign, addNegativeKeywords, addLocationTargeting` (extend the existing import).

- [ ] **Step 2: Add 3 write tools to `tools`**

```ts
{ name: "create_search_campaign", description: "Crea una campaña de búsqueda COMPLETA en PAUSA (presupuesto+campaña+grupo+keywords+anuncio+ubicación). Genera tú las keywords y los textos del anuncio a partir del negocio.",
  input_schema: { type: "object" as const, properties: {
    campaign_name: { type: "string" }, daily_budget: { type: "number", description: "presupuesto diario en la moneda de la cuenta" },
    final_url: { type: "string" }, location_name: { type: "string", description: "ciudad para segmentar, ej. 'Querétaro'" },
    keywords: { type: "array", items: { type: "object", properties: { text: { type: "string" }, match_type: { type: "string", enum: ["EXACT","PHRASE","BROAD"] } }, required: ["text","match_type"] } },
    headlines: { type: "array", items: { type: "string" }, description: "10-15 títulos ≤30 chars" },
    descriptions: { type: "array", items: { type: "string" }, description: "3-4 descripciones ≤90 chars" },
  }, required: ["campaign_name","daily_budget","final_url","keywords","headlines","descriptions"] } },
{ name: "activate_campaign", description: "Activa (ENABLED) una campaña que está en pausa. USAR SOLO tras confirmación explícita del usuario.",
  input_schema: { type: "object" as const, properties: { campaign_resource_name: { type: "string" } }, required: ["campaign_resource_name"] } },
{ name: "add_negative_keywords", description: "Agrega keywords negativas a una campaña (corta búsquedas irrelevantes; seguro, solo reduce gasto).",
  input_schema: { type: "object" as const, properties: { campaign_resource_name: { type: "string" }, keywords: { type: "array", items: { type: "string" } } }, required: ["campaign_resource_name","keywords"] } },
```

- [ ] **Step 3: Add `executeTool` cases**

```ts
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
  // result must expose the campaign resource name; add location targeting (best-effort)
  if (input.location_name) await addLocationTargeting(customerId, accessToken, result.campaignResourceName, input.location_name as string).catch(() => {});
  return JSON.stringify({ ...result, status: "PAUSED", note: "Campaña creada en PAUSA. Pide confirmación antes de activar." }, null, 2);
}
case "activate_campaign":
  await activateCampaign(customerId, accessToken, input.campaign_resource_name as string);
  return "Campaña ACTIVADA.";
case "add_negative_keywords": {
  const added = await addNegativeKeywords(customerId, accessToken, input.campaign_resource_name as string, input.keywords as string[]);
  return `Agregadas ${added} keywords negativas.`;
}
```

> Note: `createFullCampaign`'s `CreateCampaignResult` must include `campaignResourceName`. If it doesn't, add it to the return type/value in `googleAdsClient.ts` (it already computes `campaignResourceName` internally). Verify in Task 8.

- [ ] **Step 4: Rewrite `SYSTEM_PROMPT`** to the conversational non-expert brain

```ts
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
- RECOMIENDA modificadores de puja por hora/ubicación/dispositivo (ej. "-20% en madrugada, +30% en móvil") pero indícale que por ahora se aplican desde Google Ads; explica el porqué con los datos.

═══ FORMATO ═══
Respuestas cortas. Tablas Markdown solo cuando ayuden. Montos $1,234.56, porcentajes 2.5%. Muestra errores exactos de Google Ads.`;
```

- [ ] **Step 5: Verify** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 6: Commit** — `git commit -am "feat(google-ads): AI create/activate/negative tools + conversational system prompt"`

---

## Task 7: UI — "Segmentos" tab

**Files:** Modify `src/app/admin/campanas/google-ads/page.tsx`

- [ ] **Step 1: Extend the `Tab` union and state** — add `"segmentos"` to `type Tab`. Add state: `const [segView, setSegView] = useState<"hora"|"dispositivo"|"ubicacion"|"audiencias"|"extensiones">("hora")` and `const [segRows, setSegRows] = useState<Record<string, unknown>[]>([])`.

- [ ] **Step 2: Add a loader + effect** (maps sub-view → GET action)

```tsx
const SEG_ACTION: Record<string, string> = { hora: "hourly", dispositivo: "device", ubicacion: "geo", audiencias: "audiences", extensiones: "extensions" };
const loadSegment = useCallback(async () => {
  if (!isConnected) return;
  setLoading(true);
  try { const data = await apiFetch(SEG_ACTION[segView], { dateRange }); setSegRows(data?.rows ?? []); }
  catch (e) { setError(e instanceof Error ? e.message : "Error al cargar segmento."); }
  finally { setLoading(false); }
}, [isConnected, apiFetch, segView, dateRange]);
useEffect(() => { if (tab === "segmentos" && isConnected) loadSegment(); }, [tab, isConnected, loadSegment]);
```

- [ ] **Step 3: Add `"segmentos"` to the tab switcher** (label "Segmentos") and render the tab body: a sub-switcher (Hora/Dispositivo/Ubicación/Audiencias/Extensiones buttons that set `segView`) + a generic table that renders the keys of `segRows[0]` as headers and each row's values (formatting numbers with `fmtNum` and money-looking keys `cost`/`avgCpc` with `fmtMoney`). Light theme consistent with the other tabs. Empty/loading states like the other tabs.

```tsx
{tab === "segmentos" && (
  <div className="space-y-4">
    <div className="flex flex-wrap gap-2">
      {(["hora","dispositivo","ubicacion","audiencias","extensiones"] as const).map((v) => (
        <button key={v} onClick={() => setSegView(v)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${segView===v ? "bg-[#4285F4] text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>{v}</button>
      ))}
    </div>
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-200 bg-gray-50">
          {(segRows[0] ? Object.keys(segRows[0]) : []).map((k) => (
            <th key={k} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">{k}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-gray-100">
          {segRows.length === 0 && (<tr><td className="px-4 py-8 text-center text-sm text-gray-400">{loading ? "Cargando…" : "Sin datos para este segmento."}</td></tr>)}
          {segRows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {Object.entries(row).map(([k, val]) => (
                <td key={k} className="px-4 py-3 text-indexa-gray-dark">
                  {typeof val === "number" ? (/(cost|cpc)/i.test(k) ? fmtMoney(val, currency) : fmtNum(val)) : String(val)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 5: Commit** — `git commit -am "feat(admin): Google Ads Segmentos tab (hora/device/geo/audiencias/extensiones)"`

---

## Task 8: Final verification (build + manual)

**Files:** none

- [ ] **Step 1: Full build** — `npm run build` → exit 0; route `/admin/campanas/google-ads` present. Fix any type/lint error inline.
- [ ] **Step 2: Confirm `CreateCampaignResult` exposes `campaignResourceName`** (used in Task 6 Step 3). If missing, add it in `googleAdsClient.ts` and rebuild.
- [ ] **Step 3: Manual checklist** (deployed, logged in as admin, Google Ads connected):
  - "tengo una taquería en Querétaro, $300 al día, mi web es ___" → la IA hace 0-2 preguntas, crea la campaña EN PAUSA, la resume y ofrece activar.
  - "actívala" → la IA llama activate_campaign → queda ENABLED.
  - "agrega negativas para 'gratis, empleo'" → confirma cuántas agregó.
  - "analiza por hora / por dispositivo / por ubicación" → tablas + recomendaciones.
  - UI: pestaña "Segmentos" → cada sub-vista carga datos de la cuenta.
  - If geo/audiences/extensions GAQL returns an error in logs, adjust the field names (Task 2 note) and redeploy.
- [ ] **Step 4: Commit** any fixes found during manual testing.

---

## Self-Review (plan author)

- **Spec coverage:** Analizar 5 segmentos → Tasks 1-2 (client) + 5 (AI tools) + 7 (UI) ✓. Crear (PAUSA) → Task 3 (location) + 6 (create tool + prompt) ✓. Activar (confirmación) → Task 3 (activateCampaign) + 6 (tool) + prompt rules ✓. Negative keywords → Task 3 + 6 ✓. Optimizar (pausar/budget existentes + confirmación) → prompt in Task 6 ✓. Confirmation UX → SYSTEM_PROMPT (Task 6) + PAUSED creation ✓. UI Segmentos → Task 7 ✓.
- **Placeholders:** GAQL for geo/audiences/extensions flagged as verify-against-live-API with graceful degradation (`.catch(() => [])`) — concrete, not vague. Dependency on `CreateCampaignResult.campaignResourceName` flagged in Task 6 + Task 8.
- **Type consistency:** Row types defined in Tasks 1-2 used by Tasks 4-5; tool input keys (`campaign_resource_name`, `keywords`, `match_type`, `daily_budget`) consistent between Task 6 tool schemas and executeTool cases and Task 4 POST bodies (`campaignResourceName`, `keywords`). `dr` is the existing `date_range` variable in executeTool.
