# Google Ads Bid Modifiers (Fase 1.5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let the Google Ads AI APPLY bid modifiers (device, ad-schedule, location) after explicit confirmation, with safety rails (value clamp, graceful degradation).

**Architecture:** Add 3 write helpers to `googleAdsClient` (clamped), expose them as POST actions in `/api/google-ads` and as AI tools (with a confirmation rule in the system prompt). Read-then-mutate via the existing `gaqlSearch`/`gaqlMutate`.

**Tech Stack:** Next.js 16, Google Ads REST API v22 (`ad_group_bid_modifier` for device; `campaign_criterion` for ad-schedule + location), existing AI agent loop.

**Testing note:** No unit-test infra. Per-task verify = `npx tsc --noEmit`; final = `npm run build` + manual live test on a real campaign (bid-modifier payloads, esp. `ad_schedule`, are verify-live with graceful degradation).

**Spec:** `docs/superpowers/specs/2026-06-06-google-ads-bid-modifiers-fase15-design.md`

---

## File Structure
| File | Responsibility |
|------|----------------|
| `src/lib/googleAdsClient.ts` | `clampBidModifier` + `setDeviceBidModifier` + `setAdScheduleBidModifier` + `setLocationBidModifier` |
| `src/app/api/google-ads/route.ts` | 3 POST actions |
| `src/app/api/google-ads/ai/route.ts` | 3 tools + executeTool + system-prompt confirmation rule |

**Read first:** in `googleAdsClient.ts` — `gaqlSearch`, `gaqlMutate`, `extractId`, the existing write helpers (`updateCampaignBudget`, `addLocationTargeting`). They show the exact mutate payload shape (`create` / `updateMask`+`update`).

---

## Task 1: googleAdsClient — clamp + 3 setters

**Files:** Modify `src/lib/googleAdsClient.ts`

- [ ] **Step 1: Add the clamp helper** (near other private helpers like `microsToUnit`)
```ts
function clampBidModifier(m: number): number { return Math.min(3.0, Math.max(0.1, Number(m) || 1.0)); }
```

- [ ] **Step 2: `setDeviceBidModifier`** (device is ad-group level → upsert on each ad group of the campaign)
```ts
export async function setDeviceBidModifier(customerId: string, accessToken: string, campaignResourceName: string, device: string, bidModifier: number): Promise<number> {
  const mod = clampBidModifier(bidModifier);
  const dev = device.toUpperCase();
  const campaignId = extractId(campaignResourceName);
  type AgRow = { adGroup: { id: string; resourceName: string } };
  const adGroups = await gaqlSearch<AgRow>(customerId, accessToken,
    `SELECT ad_group.id, ad_group.resource_name FROM ad_group WHERE campaign.id = ${campaignId} AND ad_group.status != 'REMOVED'`);
  let applied = 0;
  for (const ag of adGroups) {
    type ExRow = { adGroupBidModifier: { resourceName: string } };
    const existing = await gaqlSearch<ExRow>(customerId, accessToken,
      `SELECT ad_group_bid_modifier.resource_name FROM ad_group_bid_modifier
       WHERE ad_group.id = ${ag.adGroup.id} AND ad_group_bid_modifier.device.type = '${dev}'`).catch(() => [] as ExRow[]);
    if (existing[0]) {
      await gaqlMutate(customerId, accessToken, "adGroupBidModifiers",
        [{ updateMask: "bidModifier", update: { resourceName: existing[0].adGroupBidModifier.resourceName, bidModifier: mod } }]);
    } else {
      await gaqlMutate(customerId, accessToken, "adGroupBidModifiers",
        [{ create: { adGroup: ag.adGroup.resourceName, device: { type: dev }, bidModifier: mod } }]);
    }
    applied++;
  }
  return applied;
}
```

- [ ] **Step 3: `setAdScheduleBidModifier`**
```ts
export async function setAdScheduleBidModifier(customerId: string, accessToken: string, campaignResourceName: string, schedule: { dayOfWeek: string; startHour: number; endHour: number }, bidModifier: number): Promise<void> {
  const mod = clampBidModifier(bidModifier);
  await gaqlMutate(customerId, accessToken, "campaignCriteria",
    [{ create: { campaign: campaignResourceName, bidModifier: mod,
        adSchedule: { dayOfWeek: schedule.dayOfWeek.toUpperCase(), startHour: schedule.startHour, startMinute: "ZERO", endHour: schedule.endHour, endMinute: "ZERO" } } }]);
}
```

- [ ] **Step 4: `setLocationBidModifier`** (resolve name → geoTargetConstant; update existing LOCATION criterion's bidModifier, else create)
```ts
export async function setLocationBidModifier(customerId: string, accessToken: string, campaignResourceName: string, locationName: string, bidModifier: number): Promise<void> {
  const mod = clampBidModifier(bidModifier);
  const campaignId = extractId(campaignResourceName);
  const name = locationName.trim().replace(/'/g, "\\'");
  type GeoRow = { geoTargetConstant: { resourceName: string } };
  const geo = (await gaqlSearch<GeoRow>(customerId, accessToken,
    `SELECT geo_target_constant.resource_name FROM geo_target_constant WHERE geo_target_constant.name = '${name}' AND geo_target_constant.status = 'ENABLED' LIMIT 1`).catch(() => [] as GeoRow[]))[0]?.geoTargetConstant?.resourceName;
  type CritRow = { campaignCriterion: { resourceName: string; location?: { geoTargetConstant?: string } } };
  const crits = await gaqlSearch<CritRow>(customerId, accessToken,
    `SELECT campaign_criterion.resource_name, campaign_criterion.location.geo_target_constant
     FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.type = 'LOCATION'`).catch(() => [] as CritRow[]);
  const match = crits.find((c) => geo && c.campaignCriterion.location?.geoTargetConstant === geo) || crits[0];
  if (match) {
    await gaqlMutate(customerId, accessToken, "campaignCriteria",
      [{ updateMask: "bidModifier", update: { resourceName: match.campaignCriterion.resourceName, bidModifier: mod } }]);
  } else if (geo) {
    await gaqlMutate(customerId, accessToken, "campaignCriteria",
      [{ create: { campaign: campaignResourceName, location: { geoTargetConstant: geo }, bidModifier: mod } }]);
  } else {
    throw new Error("No se encontró la ubicación para aplicar el modificador.");
  }
}
```

- [ ] **Step 5: Verify** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 6: Commit** — `git commit -am "feat(google-ads): bid-modifier setters (device/schedule/location) with clamp"`

---

## Task 2: API route — 3 POST actions

**Files:** Modify `src/app/api/google-ads/route.ts`

- [ ] **Step 1: Extend the import** from `@/lib/googleAdsClient`: add `setDeviceBidModifier, setAdScheduleBidModifier, setLocationBidModifier`.

- [ ] **Step 2: Add 3 POST blocks** (after the existing write blocks, before the final `"Acción no válida."` return)
```ts
if (action === "set_device_bid_modifier") {
  const { campaignResourceName, device, bidModifier } = body as { campaignResourceName?: string; device?: string; bidModifier?: number };
  if (!campaignResourceName || !device || bidModifier === undefined) return NextResponse.json({ error: "Faltan parámetros." }, { status: 400 });
  const applied = await setDeviceBidModifier(customerId, accessToken, campaignResourceName, device, bidModifier);
  return NextResponse.json({ success: true, applied });
}
if (action === "set_ad_schedule_bid_modifier") {
  const { campaignResourceName, schedule, bidModifier } = body as { campaignResourceName?: string; schedule?: { dayOfWeek: string; startHour: number; endHour: number }; bidModifier?: number };
  if (!campaignResourceName || !schedule || bidModifier === undefined) return NextResponse.json({ error: "Faltan parámetros." }, { status: 400 });
  await setAdScheduleBidModifier(customerId, accessToken, campaignResourceName, schedule, bidModifier);
  return NextResponse.json({ success: true });
}
if (action === "set_location_bid_modifier") {
  const { campaignResourceName, locationName, bidModifier } = body as { campaignResourceName?: string; locationName?: string; bidModifier?: number };
  if (!campaignResourceName || !locationName || bidModifier === undefined) return NextResponse.json({ error: "Faltan parámetros." }, { status: 400 });
  await setLocationBidModifier(customerId, accessToken, campaignResourceName, locationName, bidModifier);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 4: Commit** — `git commit -am "feat(google-ads): POST actions for bid modifiers"`

---

## Task 3: AI endpoint — tools + executeTool + prompt

**Files:** Modify `src/app/api/google-ads/ai/route.ts`

- [ ] **Step 1: Extend the import** from `@/lib/googleAdsClient`: add `setDeviceBidModifier, setAdScheduleBidModifier, setLocationBidModifier`.

- [ ] **Step 2: Add 3 tools to the `tools` array**
```ts
{ name: "set_device_bid_modifier", description: "Aplica un modificador de puja por dispositivo a una campaña. USAR SOLO tras confirmación. bid_modifier: 1.0=sin cambio, 0.8=-20%, 1.3=+30% (se acota a 0.1-3.0).",
  input_schema: { type: "object" as const, properties: { campaign_resource_name: { type: "string" }, device: { type: "string", enum: ["MOBILE","DESKTOP","TABLET"] }, bid_modifier: { type: "number" } }, required: ["campaign_resource_name","device","bid_modifier"] } },
{ name: "set_ad_schedule_bid_modifier", description: "Aplica un modificador de puja por horario (día + franja horaria). USAR SOLO tras confirmación.",
  input_schema: { type: "object" as const, properties: { campaign_resource_name: { type: "string" }, day_of_week: { type: "string", enum: ["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"] }, start_hour: { type: "number" }, end_hour: { type: "number" }, bid_modifier: { type: "number" } }, required: ["campaign_resource_name","day_of_week","start_hour","end_hour","bid_modifier"] } },
{ name: "set_location_bid_modifier", description: "Aplica un modificador de puja por ubicación. USAR SOLO tras confirmación.",
  input_schema: { type: "object" as const, properties: { campaign_resource_name: { type: "string" }, location_name: { type: "string" }, bid_modifier: { type: "number" } }, required: ["campaign_resource_name","location_name","bid_modifier"] } },
```

- [ ] **Step 3: Add executeTool cases**
```ts
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
```
(The existing executeTool try/catch already converts a thrown Error into an `ERROR: ...` string returned to the AI — that's the graceful-degradation path. Verify it does; if not, ensure the switch is inside the existing try/catch.)

- [ ] **Step 4: Add a confirmation rule to `SYSTEM_PROMPT`** — inside the `═══ OPTIMIZAR ═══` section, append:
```
- Los modificadores de puja CAMBIAN cuánto se gasta → aplícalos (set_*_bid_modifier) SOLO tras un "sí" explícito. Recomienda primero con los segmentos, confirma, luego aplica. El valor se acota a 0.1–3.0 (−90%..+200%); si la API rechaza algo, avísale al usuario que no se aplicó.
```

- [ ] **Step 5: Verify** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 6: Commit** — `git commit -am "feat(google-ads): AI bid-modifier tools + confirmation rule"`

---

## Task 4: Final verification

**Files:** none

- [ ] **Step 1: Full build** — `npm run build` → exit 0. Fix any type/lint error inline.
- [ ] **Step 2: Manual live test** (deployed, Google Ads connected, on a real/test campaign):
  - "baja −30% la puja en desktop en [campaña]" → IA recomienda → confirmas → aplica → verifica en Google Ads UI que el modificador de dispositivo quedó en 0.70.
  - "sube +20% los viernes de 7pm a 11pm" → confirma → verifica el ad-schedule modifier.
  - "−20% en [ciudad de bajo rendimiento]" → confirma → verifica el location modifier.
  - If a payload is rejected, read the error (the setter throws a clear message surfaced via the AI), adjust the field names (esp. `ad_schedule` minute enums / `device.type`), redeploy.
- [ ] **Step 3: Commit** any field-name fixes found during live testing.

---

## Self-Review (plan author)

- **Spec coverage:** 3 setters w/ clamp → Task 1 ✓. POST actions → Task 2 ✓. AI tools + confirmation prompt rule → Task 3 ✓. Safety rails: clamp (Task 1 `clampBidModifier`), confirmation (Task 3 prompt), graceful degradation (`.catch` in setters + executeTool try/catch + thrown Errors), verify-live (Task 4) ✓.
- **Placeholders:** `ad_schedule` field names + `device.type` flagged as verify-live with graceful degradation — concrete, not vague.
- **Type consistency:** setter signatures in Task 1 match the calls in Task 2 (POST) and Task 3 (executeTool); tool input keys (`campaign_resource_name`, `device`, `day_of_week`, `start_hour`, `end_hour`, `location_name`, `bid_modifier`) consistent between tool schema and executeTool. `customerId`/`accessToken`/`input` are the existing executeTool params.
