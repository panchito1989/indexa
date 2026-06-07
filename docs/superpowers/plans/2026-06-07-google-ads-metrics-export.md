# Google Ads — Rangos amplios, rendimiento, términos de búsqueda y exportación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar el tope de ~30 días, mostrar rendimiento por campaña/keyword y términos de búsqueda, añadir gráficas y permitir descargar informes (CSV + PDF con marca) en ambos dashboards de Google Ads.

**Architecture:** Híbrido con lógica compartida. Toda la lógica nueva/compleja vive en módulos compartidos (`googleAdsClient.ts` extendido, hook `useGoogleAdsData.ts`, `googleAdsExport.ts`); las dos páginas (cliente oscuro, admin claro) consumen el hook y solo renderizan JSX con su tema. El PDF se genera en el navegador (jsPDF) respetando el branding white-label vía `useBranding()`.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Firebase (auth/Firestore), Google Ads REST API v22, recharts (ya presente), jsPDF + jspdf-autotable (nuevas).

**Verificación (importante):** Este repo **no tiene infraestructura de tests** (no hay test runner en `package.json`). Siguiendo la convención del repo, cada tarea se verifica con **`npm run build`** (chequeo de tipos TypeScript + lint de Next/ESLint) y **prueba manual** descrita en cada tarea. No se introduce framework de tests (YAGNI; no fue solicitado).

**Gestor de paquetes:** npm (existe `package-lock.json`).

**Rama:** `feature/google-ads-metrics-export` (ya creada; el spec está commiteado ahí).

---

## File Structure

| Acción | Archivo | Responsabilidad |
|--------|---------|-----------------|
| ✏️ | `package.json` | Añadir `jspdf` + `jspdf-autotable` |
| ✏️ | `src/lib/googleAdsClient.ts` | Tipo `DateRangeCustom`; `getDateRange` con presets nuevos + `CUSTOM`; `custom?` en funciones con rango; nuevas `getKeywordPerformance` + `getSearchTerms` + tipos |
| ✏️ | `src/app/api/google-ads/route.ts` | Validar `startDate`/`endDate`; pasar `custom`; acciones `keyword_performance` y `search_terms` |
| 🆕 | `src/lib/googleAdsExport.ts` | `downloadCSV()` + `generateGoogleAdsPdf()` |
| 🆕 | `src/lib/useGoogleAdsData.ts` | Hook compartido: datos, rango (incl. custom), agregaciones, loaders |
| ✏️ | `src/app/dashboard/google-ads/page.tsx` | Consumir hook; selector de fechas; columnas de rendimiento; gráficas; tab Términos; export |
| ✏️ | `src/app/admin/campanas/google-ads/page.tsx` | Igual (tema claro); Términos como sub-vista de Segmentos |

**Nombres canónicos (usar idénticos en todas las tareas):**
- Tipos: `DateRangeCustom`, `GoogleAdsKeywordPerfRow`, `GoogleAdsSearchTermRow`, `CampaignPerf`
- Hook: `useGoogleAdsData()`
- Export: `downloadCSV(filename, headers, rows)`, `generateGoogleAdsPdf(opts: GoogleAdsPdfOptions)`
- Acciones API: `keyword_performance`, `search_terms`
- Valores de rango nuevos: `LAST_90_DAYS`, `LAST_12_MONTHS`, `THIS_YEAR`, `CUSTOM`

---

## Task 1: Añadir dependencias de PDF

**Files:**
- Modify: `package.json` (vía npm)

- [ ] **Step 1: Instalar**

Run:
```bash
npm install jspdf jspdf-autotable
```
Expected: `package.json` añade `jspdf` y `jspdf-autotable` en `dependencies`; `package-lock.json` actualizado.

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: build OK (sin errores). Las libs aún no se importan.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(google-ads): add jspdf + jspdf-autotable for PDF reports"
```

---

## Task 2: Rangos de fecha amplios + soporte CUSTOM en `googleAdsClient.ts`

**Files:**
- Modify: `src/lib/googleAdsClient.ts` (`getDateRange` ~líneas 162-191 y las funciones que lo llaman)

- [ ] **Step 1: Añadir tipo `DateRangeCustom` y reescribir `getDateRange`**

En la sección de tipos (junto a las otras `export interface`), añadir:
```ts
export interface DateRangeCustom {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}
```

Reemplazar la función `getDateRange` completa por:
```ts
function getDateRange(range: string, custom?: DateRangeCustom): { startDate: string; endDate: string } {
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
```

- [ ] **Step 2: Añadir `custom?` a las funciones con rango**

En cada una de estas funciones, cambiar la firma para añadir `custom?: DateRangeCustom` como último parámetro y pasar `custom` a `getDateRange`:

- `getReporting(customerId, accessToken, dateRange)` → `getReporting(customerId, accessToken, dateRange, custom?: DateRangeCustom)`; cambiar `const { startDate, endDate } = getDateRange(dateRange);` por `getDateRange(dateRange, custom);`
- `getHourlyPerformance(...)` (línea ~854): igual.
- `getDevicePerformance(...)` (~870): igual.
- `getGeoPerformance(...)` (~886): igual.
- `getAudiencePerformance(...)` (~913): igual.
- `getExtensionPerformance(...)` (~928): igual.

Ejemplo para `getReporting` (firma + primera línea del cuerpo que usa el rango):
```ts
export async function getReporting(
  customerId: string,
  accessToken: string,
  dateRange: string,
  custom?: DateRangeCustom
): Promise<GoogleAdsReportRow[]> {
  // ...types...
  const { startDate, endDate } = getDateRange(dateRange, custom);
  // ...resto igual...
}
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: OK. Los callers existentes (que no pasan `custom`) siguen compilando porque el parámetro es opcional.

- [ ] **Step 4: Commit**

```bash
git add src/lib/googleAdsClient.ts
git commit -m "feat(google-ads): wider date presets (90d/12m/this-year) + CUSTOM range support"
```

---

## Task 3: `getKeywordPerformance` + `getSearchTerms` en `googleAdsClient.ts`

**Files:**
- Modify: `src/lib/googleAdsClient.ts` (tipos nuevos + 2 funciones nuevas; sugerido al final del archivo, tras los segmentos avanzados)

- [ ] **Step 1: Añadir tipos**

Junto a los otros tipos de fila (p. ej. tras `GoogleAdsExtensionRow`):
```ts
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
```

- [ ] **Step 2: Añadir `getKeywordPerformance`**

```ts
export async function getKeywordPerformance(
  customerId: string,
  accessToken: string,
  dateRange: string,
  custom?: DateRangeCustom
): Promise<GoogleAdsKeywordPerfRow[]> {
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
  const { startDate, endDate } = getDateRange(dateRange, custom);
  const rows = await gaqlSearch<Row>(customerId, accessToken,
    `SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type, campaign.id, campaign.name,
            metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.ctr,
            metrics.average_cpc, metrics.conversions, metrics.cost_per_conversion
     FROM keyword_view
     WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
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
```

- [ ] **Step 3: Añadir `getSearchTerms`**

```ts
export async function getSearchTerms(
  customerId: string,
  accessToken: string,
  dateRange: string,
  custom?: DateRangeCustom
): Promise<GoogleAdsSearchTermRow[]> {
  type Row = {
    searchTermView: { searchTerm?: string; status?: string };
    campaign?: { name?: string };
    metrics: {
      costMicros: string; clicks: string; impressions: string;
      ctr: string; conversions: string; costPerConversion: string;
    };
  };
  const { startDate, endDate } = getDateRange(dateRange, custom);
  const rows = await gaqlSearch<Row>(customerId, accessToken,
    `SELECT search_term_view.search_term, search_term_view.status, campaign.name,
            metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.ctr,
            metrics.conversions, metrics.cost_per_conversion
     FROM search_term_view
     WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
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
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add src/lib/googleAdsClient.ts
git commit -m "feat(google-ads): add keyword_view + search_term_view performance queries"
```

---

## Task 4: API — validación de rango custom + acciones nuevas

**Files:**
- Modify: `src/app/api/google-ads/route.ts` (imports, parse de fechas, switch del GET)

- [ ] **Step 1: Importar las funciones nuevas**

En el bloque de imports desde `@/lib/googleAdsClient`, añadir:
```ts
  getKeywordPerformance,
  getSearchTerms,
```

- [ ] **Step 2: Parsear y validar el rango custom (dentro de `GET`, tras leer `dateRange`)**

Localizar (línea ~62): `const dateRange = searchParams.get("dateRange") || "LAST_7_DAYS";`
Inmediatamente después, añadir:
```ts
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
```

- [ ] **Step 3: Pasar `custom` a las acciones con rango y añadir las 2 nuevas**

En el `switch (action)` del GET:

Cambiar el caso `reporting`:
```ts
      case "reporting": {
        const rows = await getReporting(customerId, accessToken, dateRange, custom);
        return NextResponse.json({ rows });
      }
```
Cambiar los casos de segmentos para pasar `custom`:
```ts
      case "hourly":
        return NextResponse.json({ rows: await getHourlyPerformance(customerId, accessToken, dateRange, custom) });
      case "device":
        return NextResponse.json({ rows: await getDevicePerformance(customerId, accessToken, dateRange, custom) });
      case "geo":
        return NextResponse.json({ rows: await getGeoPerformance(customerId, accessToken, dateRange, custom) });
      case "audiences":
        return NextResponse.json({ rows: await getAudiencePerformance(customerId, accessToken, dateRange, custom) });
      case "extensions":
        return NextResponse.json({ rows: await getExtensionPerformance(customerId, accessToken, dateRange, custom) });
      case "keyword_performance":
        return NextResponse.json({ rows: await getKeywordPerformance(customerId, accessToken, dateRange, custom) });
      case "search_terms":
        return NextResponse.json({ rows: await getSearchTerms(customerId, accessToken, dateRange, custom) });
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 5: Verificación manual (rápida, opcional si hay cuenta conectada)**

Con la app en `npm run dev` y sesión iniciada con cuenta de Google Ads conectada, en consola del navegador:
```js
const t = await firebase.auth().currentUser.getIdToken(); // o el método de tu AuthContext
fetch('/api/google-ads?action=search_terms&dateRange=LAST_30_DAYS', { headers: { Authorization: `Bearer ${t}` }}).then(r=>r.json()).then(console.log)
```
Expected: `{ rows: [...] }`. Y `?dateRange=CUSTOM&startDate=2026-01-01&endDate=2026-01-31` devuelve datos; con fechas inválidas devuelve 400.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/google-ads/route.ts
git commit -m "feat(google-ads): API custom date validation + keyword_performance & search_terms actions"
```

---

## Task 5: Módulo de exportación `googleAdsExport.ts` (CSV + PDF)

**Files:**
- Create: `src/lib/googleAdsExport.ts`

- [ ] **Step 1: Crear el archivo con CSV + PDF**

```ts
"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  GoogleAdsAccountInfo, GoogleAdsKeywordPerfRow, GoogleAdsSearchTermRow,
} from "@/lib/googleAdsClient";

// ── CSV ───────────────────────────────────────────────────────────────
/** Dispara la descarga de un CSV (con BOM para que Excel respete acentos). */
export function downloadCSV(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── PDF ───────────────────────────────────────────────────────────────
export interface GoogleAdsPdfOptions {
  brandName: string;
  logoUrl?: string;
  colorHex: string; // p. ej. "#002366"
  accountInfo: GoogleAdsAccountInfo | null;
  currency: string;
  periodLabel: string;
  totals: {
    spend: number; clicks: number; impressions: number;
    conversions: number; ctr: number; cpc: number; cpa: number;
  };
  campaigns: Array<{
    name: string; cost: number; clicks: number; impressions: number;
    ctr: number; conversions: number; cpa: number;
  }>;
  keywords: GoogleAdsKeywordPerfRow[];
  searchTerms: GoogleAdsSearchTermRow[];
  chart: Array<{ date: string; cost: number }>;
  generatedAtLabel: string; // fecha pasada desde el cliente (no usar Date dentro)
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full || "002366", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function loadImageDataUrl(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    const dims: { w: number; h: number } = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = dataUrl;
    });
    if (!dims.w || !dims.h) return null;
    return { dataUrl, ...dims };
  } catch {
    return null;
  }
}

function money(v: number, currency: string) {
  return v.toLocaleString("es-MX", { style: "currency", currency, maximumFractionDigits: 2 });
}
function num(v: number) {
  return v.toLocaleString("es-MX");
}

/** Genera y descarga el informe PDF con marca. */
export async function generateGoogleAdsPdf(opts: GoogleAdsPdfOptions): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const rgb = hexToRgb(opts.colorHex);
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  // Header band
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.rect(0, 0, pageW, 70, "F");

  // Logo (opcional)
  if (opts.logoUrl) {
    const img = await loadImageDataUrl(opts.logoUrl);
    if (img) {
      const h = 36;
      const w = Math.min(120, (img.w / img.h) * h);
      try { doc.addImage(img.dataUrl, "PNG", margin, 18, w, h); } catch { /* ignore */ }
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(opts.brandName, pageW - margin, 32, { align: "right" });
  doc.setFontSize(11);
  doc.text("Informe de Google Ads", pageW - margin, 50, { align: "right" });

  y = 95;
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(10);
  const accountLine = opts.accountInfo
    ? `${opts.accountInfo.descriptiveName} · ${opts.accountInfo.customerId}`
    : "";
  if (accountLine) { doc.text(accountLine, margin, y); y += 14; }
  doc.text(`Periodo: ${opts.periodLabel}`, margin, y); y += 20;

  // KPIs
  const t = opts.totals;
  autoTable(doc, {
    startY: y,
    head: [["Gasto", "Clics", "Impresiones", "CTR", "CPC", "Conversiones", "CPA"]],
    body: [[
      money(t.spend, opts.currency), num(t.clicks), num(t.impressions),
      `${t.ctr.toFixed(2)}%`, money(t.cpc, opts.currency), num(t.conversions),
      t.conversions > 0 ? money(t.cpa, opts.currency) : "—",
    ]],
    theme: "grid",
    headStyles: { fillColor: rgb, textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    margin: { left: margin, right: margin },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  // Gráfica nativa: gasto por fecha (barras)
  if (opts.chart.length > 0) {
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    doc.text("Gasto por fecha", margin, y);
    y += 8;
    const chartH = 90;
    const chartW = pageW - margin * 2;
    const maxCost = Math.max(...opts.chart.map((d) => d.cost), 1);
    const n = opts.chart.length;
    const gap = 2;
    const barW = Math.max(1, (chartW - gap * (n - 1)) / n);
    const baseY = y + chartH;
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, baseY, margin + chartW, baseY);
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    opts.chart.forEach((d, i) => {
      const h = (d.cost / maxCost) * chartH;
      const x = margin + i * (barW + gap);
      doc.rect(x, baseY - h, barW, h, "F");
    });
    y = baseY + 24;
  }

  // Tabla por campaña
  if (opts.campaigns.length > 0) {
    doc.setFontSize(11);
    doc.text("Rendimiento por campaña", margin, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Campaña", "Gasto", "Clics", "Impr.", "CTR", "Conv.", "CPA"]],
      body: opts.campaigns.map((c) => [
        c.name, money(c.cost, opts.currency), num(c.clicks), num(c.impressions),
        `${c.ctr.toFixed(2)}%`, num(c.conversions),
        c.conversions > 0 ? money(c.cpa, opts.currency) : "—",
      ]),
      theme: "striped",
      headStyles: { fillColor: rgb, textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  }

  // Top keywords
  if (opts.keywords.length > 0) {
    doc.setFontSize(11);
    doc.text("Top palabras clave (por gasto)", margin, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Keyword", "Gasto", "Clics", "CTR", "Conv.", "CPA"]],
      body: opts.keywords.slice(0, 20).map((k) => [
        k.text, money(k.cost, opts.currency), num(k.clicks),
        `${k.ctr.toFixed(2)}%`, num(k.conversions),
        k.conversions > 0 ? money(k.costPerConversion, opts.currency) : "—",
      ]),
      theme: "striped",
      headStyles: { fillColor: rgb, textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  }

  // Top términos de búsqueda
  if (opts.searchTerms.length > 0) {
    doc.setFontSize(11);
    doc.text("Top términos de búsqueda (por gasto)", margin, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Término", "Gasto", "Clics", "CTR", "Conv.", "CPA"]],
      body: opts.searchTerms.slice(0, 20).map((s) => [
        s.term, money(s.cost, opts.currency), num(s.clicks),
        `${s.ctr.toFixed(2)}%`, num(s.conversions),
        s.conversions > 0 ? money(s.costPerConversion, opts.currency) : "—",
      ]),
      theme: "striped",
      headStyles: { fillColor: rgb, textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: margin, right: margin },
    });
  }

  // Pie en todas las páginas
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    const ph = doc.internal.pageSize.getHeight();
    doc.text(`${opts.brandName} · Generado ${opts.generatedAtLabel}`, margin, ph - 20);
    doc.text(`${i} / ${pageCount}`, pageW - margin, ph - 20, { align: "right" });
  }

  doc.save(`informe-google-ads-${opts.periodLabel.replace(/[^\dA-Za-z]+/g, "-")}.pdf`);
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: OK. (Si `autoTable`/`lastAutoTable` da error de tipos, el cast `as unknown as { lastAutoTable: { finalY: number } }` ya está aplicado; no usar `any`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/googleAdsExport.ts
git commit -m "feat(google-ads): shared CSV + branded PDF export module"
```

---

## Task 6: Hook compartido `useGoogleAdsData.ts`

**Files:**
- Create: `src/lib/useGoogleAdsData.ts`

- [ ] **Step 1: Crear el hook**

```ts
"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import type {
  GoogleAdsCampaign, GoogleAdsKeyword, GoogleAdsReportRow, GoogleAdsAccountInfo,
  GoogleAdsKeywordPerfRow, GoogleAdsSearchTermRow,
} from "@/lib/googleAdsClient";

export interface CampaignPerf {
  cost: number; clicks: number; impressions: number;
  conversions: number; ctr: number; cpa: number;
}

export function useGoogleAdsData() {
  const { user } = useAuth();

  const [customerId, setCustomerId] = useState("");
  const [accountInfo, setAccountInfo] = useState<GoogleAdsAccountInfo | null>(null);

  const [dateRange, setDateRange] = useState("LAST_7_DAYS");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const [campaigns, setCampaigns] = useState<GoogleAdsCampaign[]>([]);
  const [reportRows, setReportRows] = useState<GoogleAdsReportRow[]>([]);
  const [keywords, setKeywords] = useState<GoogleAdsKeyword[]>([]);
  const [keywordPerf, setKeywordPerf] = useState<GoogleAdsKeywordPerfRow[]>([]);
  const [searchTerms, setSearchTerms] = useState<GoogleAdsSearchTermRow[]>([]);
  const [segRows, setSegRows] = useState<Record<string, unknown>[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isConnected = !!customerId;

  // ── Load tokens (customerId) on mount ──────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ action: "load" }),
        });
        const { tokens } = await res.json();
        if (tokens?.googleAdsCustomerId) setCustomerId(tokens.googleAdsCustomerId);
      } catch (e) {
        console.error("[useGoogleAdsData] token load", e);
      }
    })();
  }, [user]);

  // ── Build query params (range + custom) ────────────────────────────
  const rangeParams = useCallback((): Record<string, string> => {
    const p: Record<string, string> = { dateRange };
    if (dateRange === "CUSTOM" && customStart && customEnd) {
      p.startDate = customStart;
      p.endDate = customEnd;
    }
    return p;
  }, [dateRange, customStart, customEnd]);

  // ── API helpers ────────────────────────────────────────────────────
  const apiFetch = useCallback(async (action: string, params: Record<string, string> = {}) => {
    if (!user) return null;
    const idToken = await user.getIdToken();
    const qs = new URLSearchParams({ action, ...params });
    const res = await fetch(`/api/google-ads?${qs}`, { headers: { Authorization: `Bearer ${idToken}` } });
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

  // ── Loaders ─────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    setError("");
    try {
      const [info, campaignData, reportData] = await Promise.all([
        apiFetch("account_info"),
        apiFetch("campaigns"),
        apiFetch("reporting", rangeParams()),
      ]);
      if (info?.info) setAccountInfo(info.info);
      if (campaignData?.campaigns) setCampaigns(campaignData.campaigns);
      if (reportData?.rows) setReportRows(reportData.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos.");
    } finally {
      setLoading(false);
    }
  }, [isConnected, apiFetch, rangeParams]);

  const loadKeywords = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    try {
      const data = await apiFetch("keywords");
      if (data?.keywords) setKeywords(data.keywords);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar keywords.");
    } finally { setLoading(false); }
  }, [isConnected, apiFetch]);

  const loadKeywordPerf = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    try {
      const data = await apiFetch("keyword_performance", rangeParams());
      if (data?.rows) setKeywordPerf(data.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar rendimiento de keywords.");
    } finally { setLoading(false); }
  }, [isConnected, apiFetch, rangeParams]);

  const loadSearchTerms = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    try {
      const data = await apiFetch("search_terms", rangeParams());
      if (data?.rows) setSearchTerms(data.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar términos de búsqueda.");
    } finally { setLoading(false); }
  }, [isConnected, apiFetch, rangeParams]);

  const loadSegment = useCallback(async (action: string) => {
    if (!isConnected) return;
    setLoading(true);
    try {
      const data = await apiFetch(action, rangeParams());
      setSegRows(data?.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar segmento.");
    } finally { setLoading(false); }
  }, [isConnected, apiFetch, rangeParams]);

  // Trae keyword-perf + términos frescos para el informe (PDF se puede exportar
  // desde Resumen sin haber abierto esos tabs). Devuelve los datos y también los
  // guarda en estado.
  const fetchForExport = useCallback(async () => {
    const [kp, st] = await Promise.all([
      apiFetch("keyword_performance", rangeParams()),
      apiFetch("search_terms", rangeParams()),
    ]);
    const kw: GoogleAdsKeywordPerfRow[] = kp?.rows ?? [];
    const terms: GoogleAdsSearchTermRow[] = st?.rows ?? [];
    setKeywordPerf(kw);
    setSearchTerms(terms);
    return { keywords: kw, searchTerms: terms };
  }, [apiFetch, rangeParams]);

  // Auto-cargar al conectar y al cambiar de rango
  useEffect(() => {
    if (isConnected) loadData();
  }, [isConnected, loadData]);

  // ── Helpers de rango ────────────────────────────────────────────────
  const setCustomRange = useCallback((start: string, end: string) => {
    setCustomStart(start);
    setCustomEnd(end);
  }, []);

  // ── Derivados ───────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const spend = reportRows.reduce((s, r) => s + r.cost, 0);
    const clicks = reportRows.reduce((s, r) => s + r.clicks, 0);
    const impressions = reportRows.reduce((s, r) => s + r.impressions, 0);
    const conversions = reportRows.reduce((s, r) => s + r.conversions, 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpa = conversions > 0 ? spend / conversions : 0;
    return { spend, clicks, impressions, conversions, ctr, cpc, cpa };
  }, [reportRows]);

  const campaignPerf = useMemo(() => {
    const map = new Map<string, CampaignPerf>();
    for (const r of reportRows) {
      const cur = map.get(r.campaignId) ?? { cost: 0, clicks: 0, impressions: 0, conversions: 0, ctr: 0, cpa: 0 };
      cur.cost += r.cost;
      cur.clicks += r.clicks;
      cur.impressions += r.impressions;
      cur.conversions += r.conversions;
      map.set(r.campaignId, cur);
    }
    for (const [, v] of map) {
      v.ctr = v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0;
      v.cpa = v.conversions > 0 ? v.cost / v.conversions : 0;
    }
    return map;
  }, [reportRows]);

  const chartData = useMemo(() => {
    const byDate: Record<string, { date: string; cost: number; conversions: number }> = {};
    for (const r of reportRows) {
      if (!byDate[r.date]) byDate[r.date] = { date: r.date, cost: 0, conversions: 0 };
      byDate[r.date].cost += r.cost;
      byDate[r.date].conversions += r.conversions;
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [reportRows]);

  const campaignChart = useMemo(() => {
    return campaigns
      .map((c) => {
        const p = campaignPerf.get(c.campaignId);
        return {
          name: c.campaignName,
          cost: p?.cost ?? 0,
          conversions: p?.conversions ?? 0,
          cpa: p?.cpa ?? 0,
        };
      })
      .filter((c) => c.cost > 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 8);
  }, [campaigns, campaignPerf]);

  const currency = accountInfo?.currencyCode ?? "MXN";

  return {
    // connection
    customerId, setCustomerId, accountInfo, currency, isConnected,
    // range
    dateRange, setDateRange, customStart, customEnd, setCustomRange,
    // data
    campaigns, setCampaigns, reportRows, keywords, keywordPerf, searchTerms, segRows,
    // derived
    totals, campaignPerf, chartData, campaignChart,
    // status
    loading, error, setError,
    // actions
    loadData, loadKeywords, loadKeywordPerf, loadSearchTerms, loadSegment, apiPost, fetchForExport,
  };
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: OK (el hook aún no se usa, pero debe compilar).

- [ ] **Step 3: Commit**

```bash
git add src/lib/useGoogleAdsData.ts
git commit -m "feat(google-ads): shared useGoogleAdsData hook (data + aggregations + range)"
```

---

## Task 7: Dashboard cliente — adoptar el hook (paridad, sin UI nueva)

**Objetivo:** sustituir el estado/lógica inline de `src/app/dashboard/google-ads/page.tsx` por `useGoogleAdsData()`, **sin cambiar la UI todavía**. Esto reduce el diff de las tareas siguientes y verifica paridad.

**Files:**
- Modify: `src/app/dashboard/google-ads/page.tsx`

- [ ] **Step 1: Reemplazar el bloque de estado de datos por el hook**

Quitar los `useState` de `customerId, accountInfo, dateRange, campaigns, keywords, reportRows, loading, error` y las funciones `apiFetch, apiPost, loadData, loadKeywords` y las agregaciones (`reportByDate, chartData, totalSpend, ...`). En su lugar, justo después de los estados específicos de la página (`pageLoading, sitio, sitioId, showPaywall, paywallFeature`), añadir:
```ts
  const {
    customerId, setCustomerId, accountInfo, currency, isConnected,
    dateRange, setDateRange,
    campaigns, keywords, reportRows,
    totals, campaignPerf, chartData,
    loading, error, setError,
    loadData, loadKeywords, apiPost,
  } = useGoogleAdsData();
```
E importar al inicio: `import { useGoogleAdsData } from "@/lib/useGoogleAdsData";`

- [ ] **Step 2: Adaptar referencias a los nuevos nombres**

- `totalSpend` → `totals.spend`, `totalClicks` → `totals.clicks`, `totalImpressions` → `totals.impressions`, `totalConversions` → `totals.conversions`, `avgCtr` → `totals.ctr`, `avgCpc` → `totals.cpc`.
- `chartData` ahora viene del hook (incluye `conversions`, pero el `<Line dataKey="cost" />` actual sigue funcionando).
- La carga inicial de tokens y el `useEffect` de `loadData`/`loadKeywords` ahora los maneja el hook; eliminar los `useEffect` duplicados de la página EXCEPTO el que carga `sitio`/`profile` (ese se queda) y el `tab === "keywords"` que debe llamar al `loadKeywords` del hook.
- En el flujo `onConnected` de `GoogleAdsConnect`, usar `setCustomerId(tokens.googleAdsCustomerId)` del hook.
- Mantener `isActive`, paywall, `requireActive`, `toggleCampaign` (que usa `apiPost` del hook y `setCampaigns`… → usar `setCampaigns` del hook: añadir `setCampaigns` al destructuring).

> Nota: añadir `setCampaigns` al destructuring del Step 1 si `toggleCampaign` actualiza el estado local de campañas.

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 4: Verificación manual (paridad)**

`npm run dev` → entrar a `/dashboard/google-ads` con cuenta conectada. Confirmar que: KPIs, gráfica de gasto, tabs Campañas/Keywords, cambio de rango y pausar/activar campaña funcionan **igual que antes**.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/google-ads/page.tsx
git commit -m "refactor(google-ads): client dashboard consumes useGoogleAdsData (parity)"
```

---

## Task 8: Dashboard cliente — selector de fechas (presets + custom) y columnas de rendimiento

**Files:**
- Modify: `src/app/dashboard/google-ads/page.tsx`

- [ ] **Step 1: Ampliar `DATE_RANGES`**

Reemplazar el array `DATE_RANGES` por:
```ts
const DATE_RANGES = [
  { value: "LAST_7_DAYS",   label: "Últimos 7 días"   },
  { value: "LAST_30_DAYS",  label: "Últimos 30 días"  },
  { value: "LAST_90_DAYS",  label: "Últimos 90 días"  },
  { value: "LAST_12_MONTHS",label: "Últimos 12 meses" },
  { value: "THIS_MONTH",    label: "Este mes"          },
  { value: "LAST_MONTH",    label: "Mes anterior"      },
  { value: "THIS_YEAR",     label: "Este año"          },
  { value: "CUSTOM",        label: "Personalizado…"    },
];
```

- [ ] **Step 2: Añadir inputs de rango personalizado**

Añadir al destructuring del hook: `customStart, customEnd, setCustomRange`.
Junto al `<select>` de rango (en el header), añadir el bloque condicional:
```tsx
{dateRange === "CUSTOM" && (
  <div className="flex items-center gap-1">
    <input
      type="date"
      value={customStart}
      max={customEnd || undefined}
      onChange={(e) => setCustomRange(e.target.value, customEnd)}
      className="rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/70 focus:outline-none"
    />
    <span className="text-white/30 text-xs">→</span>
    <input
      type="date"
      value={customEnd}
      min={customStart || undefined}
      onChange={(e) => setCustomRange(customStart, e.target.value)}
      className="rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/70 focus:outline-none"
    />
    <button
      onClick={() => { if (customStart && customEnd) loadData(); }}
      disabled={!customStart || !customEnd}
      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
    >
      Aplicar
    </button>
  </div>
)}
```

- [ ] **Step 3: Columnas de rendimiento en la tabla de Campañas**

En el `<thead>` de Campañas, añadir tras "Tipo":
```tsx
<th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Clics</th>
<th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Impr.</th>
<th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">CTR</th>
<th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Conv.</th>
<th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">CPA</th>
```
En el `<tbody>`, dentro del `map`, antes de la celda de "Presup./día", añadir (usa `campaignPerf`):
```tsx
{(() => {
  const p = campaignPerf.get(c.campaignId);
  return (
    <>
      <td className="px-4 py-3 text-right text-white/70">{p ? fmtNum(p.clicks) : "—"}</td>
      <td className="px-4 py-3 text-right text-white/70">{p ? fmtNum(p.impressions) : "—"}</td>
      <td className="px-4 py-3 text-right text-white/70">{p ? `${p.ctr.toFixed(2)}%` : "—"}</td>
      <td className="px-4 py-3 text-right text-white/70">{p ? fmtNum(p.conversions) : "—"}</td>
      <td className="px-4 py-3 text-right text-white/70">{p && p.conversions > 0 ? fmtMoney(p.cpa, currency) : "—"}</td>
    </>
  );
})()}
```
Actualizar el `colSpan` del estado vacío de esa tabla (de `5` a `10`).

- [ ] **Step 4: Columnas de rendimiento en Keywords**

Añadir al destructuring del hook: `keywordPerf, loadKeywordPerf`.
Cambiar el `useEffect` del tab keywords para cargar también el rendimiento:
```ts
useEffect(() => {
  if (tab === "keywords" && isConnected) { loadKeywords(); loadKeywordPerf(); }
}, [tab, isConnected, loadKeywords, loadKeywordPerf, dateRange, customStart, customEnd]);
```
Crear un mapa de métricas por `keywordId` antes del JSX de la tabla:
```ts
const kwPerfById = new Map(keywordPerf.map((k) => [k.keywordId, k]));
```
En `<thead>` de keywords, añadir tras "Quality Score":
```tsx
<th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Gasto</th>
<th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Clics</th>
<th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Conv.</th>
<th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">CPA</th>
```
En el `map`, antes de la celda de Estado:
```tsx
{(() => {
  const p = kwPerfById.get(kw.keywordId);
  return (
    <>
      <td className="px-4 py-3 text-right text-white/70">{p ? fmtMoney(p.cost, currency) : "—"}</td>
      <td className="px-4 py-3 text-right text-white/70">{p ? fmtNum(p.clicks) : "—"}</td>
      <td className="px-4 py-3 text-right text-white/70">{p ? fmtNum(p.conversions) : "—"}</td>
      <td className="px-4 py-3 text-right text-white/70">{p && p.conversions > 0 ? fmtMoney(p.costPerConversion, currency) : "—"}</td>
    </>
  );
})()}
```
Actualizar el `colSpan` del estado vacío de keywords (de `4` a `8`).

- [ ] **Step 5: Verificar build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 6: Verificación manual**

`/dashboard/google-ads`: el dropdown muestra los rangos nuevos; "Personalizado…" muestra los dos calendarios + Aplicar; Campañas y Keywords muestran columnas de rendimiento con CPA; cambiar a 90 días/12 meses recalcula.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/google-ads/page.tsx
git commit -m "feat(google-ads): client date ranges (presets + custom) + campaign/keyword performance columns"
```

---

## Task 9: Dashboard cliente — gráficas nuevas, tab Términos y exportación

**Files:**
- Modify: `src/app/dashboard/google-ads/page.tsx`

- [ ] **Step 1: Imports y branding**

Añadir imports:
```ts
import { BarChart, Bar, Legend } from "recharts";
import { downloadCSV, generateGoogleAdsPdf } from "@/lib/googleAdsExport";
import { useBranding } from "@/lib/BrandingContext";
import { Download, FileText } from "lucide-react";
```
Añadir el hook de branding en el componente: `const { branding, brandName } = useBranding();`
Añadir al destructuring de `useGoogleAdsData`: `searchTerms, loadSearchTerms, campaignChart, fetchForExport`.

- [ ] **Step 2: Ampliar el tipo `Tab` y el switcher**

Cambiar:
```ts
type Tab = "resumen" | "campanas" | "keywords" | "anuncios" | "terminos";
```
En el array de tabs del switcher añadir `"terminos"`, y en el label ternario añadir: `t === "terminos" ? "Términos" : ...`.
Añadir efecto de carga:
```ts
useEffect(() => {
  if (tab === "terminos" && isConnected) loadSearchTerms();
}, [tab, isConnected, loadSearchTerms, dateRange, customStart, customEnd]);
```

- [ ] **Step 3: Gráfica Gasto + Conversiones (doble eje)**

Reemplazar el `<LineChart>` actual de "Gasto diario" por:
```tsx
<h3 className="mb-4 text-sm font-semibold text-white/70">Gasto y conversiones</h3>
<ResponsiveContainer width="100%" height={220}>
  <LineChart data={chartData}>
    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
    <Tooltip contentStyle={{ background: "#0f0f17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }} labelStyle={{ color: "rgba(255,255,255,0.6)" }} />
    <Legend wrapperStyle={{ fontSize: 11 }} />
    <Line yAxisId="left" type="monotone" dataKey="cost" stroke="#4285F4" strokeWidth={2} dot={false} name="Gasto" />
    <Line yAxisId="right" type="monotone" dataKey="conversions" stroke="#34a853" strokeWidth={2} dot={false} name="Conversiones" />
  </LineChart>
</ResponsiveContainer>
```

- [ ] **Step 4: Gráfica de barras Conversiones/CPA por campaña**

Debajo de la gráfica anterior, añadir (solo si hay datos):
```tsx
{campaignChart.length > 0 && (
  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
    <h3 className="mb-4 text-sm font-semibold text-white/70">Conversiones por campaña</h3>
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={campaignChart}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} interval={0} angle={-15} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
        <Tooltip contentStyle={{ background: "#0f0f17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }} />
        <Bar dataKey="conversions" fill="#34a853" name="Conversiones" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
)}
```

- [ ] **Step 5: Botones Exportar CSV + Informe PDF (en el header, junto a Actualizar)**

Definir handlers en el componente:
```ts
const handleExportCsv = () => {
  const headers = ["Campaña", "Tipo", "Gasto", "Clics", "Impresiones", "CTR", "Conversiones", "CPA", "Estado"];
  const rows = campaigns.map((c) => {
    const p = campaignPerf.get(c.campaignId);
    return [
      c.campaignName, c.channelType, p?.cost ?? 0, p?.clicks ?? 0, p?.impressions ?? 0,
      p ? Number(p.ctr.toFixed(2)) : 0, p?.conversions ?? 0, p && p.conversions > 0 ? Number(p.cpa.toFixed(2)) : 0, c.status,
    ];
  });
  downloadCSV(`campanas-${dateRange.toLowerCase()}.csv`, headers, rows);
};

const [pdfLoading, setPdfLoading] = useState(false);
const handleExportPdf = async () => {
  setPdfLoading(true);
  try {
    const periodLabel = DATE_RANGES.find((r) => r.value === dateRange)?.label || dateRange;
    // Trae keyword-perf + términos frescos por si se exporta desde Resumen.
    const { keywords: kw, searchTerms: st } = await fetchForExport();
    await generateGoogleAdsPdf({
      brandName,
      logoUrl: branding.logoUrl || undefined,
      colorHex: branding.colorPrincipal || "#002366",
      accountInfo,
      currency,
      periodLabel: dateRange === "CUSTOM" ? `${customStart} a ${customEnd}` : periodLabel,
      totals,
      campaigns: campaigns.map((c) => {
        const p = campaignPerf.get(c.campaignId);
        return { name: c.campaignName, cost: p?.cost ?? 0, clicks: p?.clicks ?? 0, impressions: p?.impressions ?? 0, ctr: p?.ctr ?? 0, conversions: p?.conversions ?? 0, cpa: p?.cpa ?? 0 };
      }),
      keywords: kw,
      searchTerms: st,
      chart: chartData.map((d) => ({ date: d.date, cost: d.cost })),
      generatedAtLabel: new Date().toLocaleDateString("es-MX"),
    });
  } catch (e) {
    setError(e instanceof Error ? e.message : "Error al generar el PDF.");
  } finally {
    setPdfLoading(false);
  }
};
```
> Nota: `new Date()` aquí es código de cliente en el navegador (no script de workflow), por lo que es válido.

Botones (junto a "Actualizar"):
```tsx
<button onClick={handleExportCsv} disabled={!reportRows.length} className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 disabled:opacity-40">
  <Download size={13} /> CSV
</button>
<button onClick={handleExportPdf} disabled={!reportRows.length || pdfLoading} className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 disabled:opacity-40">
  {pdfLoading ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} Informe PDF
</button>
```

- [ ] **Step 6: Tab Términos de búsqueda**

Antes del cierre del contenedor de tabs, añadir el bloque:
```tsx
{tab === "terminos" && (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <div className="mb-3 flex justify-end">
      <button
        onClick={() => downloadCSV(
          `terminos-${dateRange.toLowerCase()}.csv`,
          ["Término", "Campaña", "Gasto", "Clics", "Impresiones", "CTR", "Conversiones", "CPA"],
          searchTerms.map((s) => [s.term, s.campaignName, s.cost, s.clicks, s.impressions, Number(s.ctr.toFixed(2)), s.conversions, s.conversions > 0 ? Number(s.costPerConversion.toFixed(2)) : 0]),
        )}
        disabled={!searchTerms.length}
        className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 disabled:opacity-40"
      >
        <Download size={13} /> CSV
      </button>
    </div>
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.02]">
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Término</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Campaña</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Gasto</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Clics</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">CTR</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Conv.</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">CPA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {searchTerms.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-white/30">{loading ? "Cargando términos…" : "Sin términos de búsqueda."}</td></tr>
          )}
          {searchTerms.map((s, i) => (
            <tr key={i} className="hover:bg-white/[0.02]">
              <td className="px-4 py-3 font-medium text-white">{s.term}</td>
              <td className="px-4 py-3 text-xs text-white/50">{s.campaignName}</td>
              <td className="px-4 py-3 text-right text-white/70">{fmtMoney(s.cost, currency)}</td>
              <td className="px-4 py-3 text-right text-white/70">{fmtNum(s.clicks)}</td>
              <td className="px-4 py-3 text-right text-white/70">{s.ctr.toFixed(2)}%</td>
              <td className="px-4 py-3 text-right text-white/70">{fmtNum(s.conversions)}</td>
              <td className="px-4 py-3 text-right text-white/70">{s.conversions > 0 ? fmtMoney(s.costPerConversion, currency) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {searchTerms.length >= 200 && (
      <p className="mt-2 text-xs text-white/30">Mostrando los 200 términos con mayor gasto.</p>
    )}
  </motion.div>
)}
```

- [ ] **Step 7: Verificar build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 8: Verificación manual**

`/dashboard/google-ads`: Resumen muestra gráfica gasto+conversiones y barras por campaña; botones CSV/PDF descargan; el PDF sale con la marca (Indexa por defecto, o agencia si el usuario es white-label); tab Términos lista datos y exporta CSV.

- [ ] **Step 9: Commit**

```bash
git add src/app/dashboard/google-ads/page.tsx
git commit -m "feat(google-ads): client charts (spend+conv, per-campaign), search terms tab, CSV/PDF export"
```

---

## Task 10: Dashboard admin — adoptar el hook (paridad)

**Files:**
- Modify: `src/app/admin/campanas/google-ads/page.tsx`

- [ ] **Step 1: Sustituir estado/lógica por el hook**

Igual que Task 7 pero para el admin. Quitar los `useState`/`apiFetch`/`apiPost`/`loadData`/`loadKeywords`/`loadAds`/`loadSegment` y agregaciones inline; destructurar del hook:
```ts
  const {
    customerId, setCustomerId, accountInfo, currency, isConnected,
    dateRange, setDateRange, customStart, customEnd, setCustomRange,
    campaigns, setCampaigns, keywords, reportRows, keywordPerf, searchTerms, segRows,
    totals, campaignPerf, chartData, campaignChart,
    loading, error, setError,
    loadData, loadKeywords, loadKeywordPerf, loadSearchTerms, loadSegment, apiPost,
  } = useGoogleAdsData();
```
Importar: `import { useGoogleAdsData } from "@/lib/useGoogleAdsData";`

Mantener en la página lo específico de admin: `ads`/`loadAds` (la tab Anuncios del admin sí lista anuncios — conservar su `useState` y su loader propio usando un `apiFetch` local mínimo o exponer un loader genérico; **decisión:** conservar un `apiFetch` local SOLO para `ads` para no ampliar el hook), `editingBudget`/`budgetInput`/`saveBudget`, y todo el bloque del Asistente IA (`aiHistory`, `sendAi`, etc.).

> Para `ads` (la tab Anuncios del admin sí lista anuncios), mantener estado local en la página
> con su propio indicador de carga (`adsLoading`). `user` viene del `useAuth()` que el admin ya tiene;
> `setError` viene del hook:
```ts
const [ads, setAds] = useState<GoogleAdsAd[]>([]);
const [adsLoading, setAdsLoading] = useState(false);
const loadAds = useCallback(async () => {
  if (!isConnected || !user) return;
  setAdsLoading(true);
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`/api/google-ads?action=ads`, { headers: { Authorization: `Bearer ${idToken}` } });
    const data = await res.json();
    if (res.ok && data?.ads) setAds(data.ads);
    else if (!res.ok) setError(data.error || "Error al cargar anuncios.");
  } catch (e) {
    setError(e instanceof Error ? e.message : "Error al cargar anuncios.");
  } finally {
    setAdsLoading(false);
  }
}, [isConnected, user, setError]);
```
Conservar el `useEffect` de `tab === "anuncios"` llamando a este `loadAds`. En el JSX de la tabla de
Anuncios, usar `adsLoading` en lugar del `loading` que antes venía del estado local de la página.

Para `saveBudget`/`toggleCampaign`: usar `apiPost` y `setCampaigns` del hook (mantener `actionLoading` local).

- [ ] **Step 2: Adaptar referencias a los nombres derivados**

`totalSpend → totals.spend`, etc. (igual que Task 7, Step 2). `chartData` del hook.

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 4: Verificación manual (paridad)**

`/admin/campanas/google-ads`: KPIs, gráfica, tabs Campañas (con edición de presupuesto), Keywords, Anuncios, Asistente IA y Segmentos funcionan **igual que antes**.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/campanas/google-ads/page.tsx
git commit -m "refactor(google-ads): admin dashboard consumes useGoogleAdsData (parity)"
```

---

## Task 11: Dashboard admin — selector de fechas + columnas de rendimiento

**Files:**
- Modify: `src/app/admin/campanas/google-ads/page.tsx`

- [ ] **Step 1: Ampliar `DATE_RANGES`**

Reemplazar el array `DATE_RANGES` del admin por:
```ts
const DATE_RANGES = [
  { value: "LAST_7_DAYS",   label: "Últimos 7 días"   },
  { value: "LAST_30_DAYS",  label: "Últimos 30 días"  },
  { value: "LAST_90_DAYS",  label: "Últimos 90 días"  },
  { value: "LAST_12_MONTHS",label: "Últimos 12 meses" },
  { value: "THIS_MONTH",    label: "Este mes"          },
  { value: "LAST_MONTH",    label: "Mes anterior"      },
  { value: "THIS_YEAR",     label: "Este año"          },
  { value: "CUSTOM",        label: "Personalizado…"    },
];
```

- [ ] **Step 2: Inputs de rango personalizado** (tema claro)

Bloque condicional junto al `<select>`:
```tsx
{dateRange === "CUSTOM" && (
  <div className="flex items-center gap-1">
    <input type="date" value={customStart} max={customEnd || undefined}
      onChange={(e) => setCustomRange(e.target.value, customEnd)}
      className="rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-600 focus:outline-none" />
    <span className="text-gray-400 text-xs">→</span>
    <input type="date" value={customEnd} min={customStart || undefined}
      onChange={(e) => setCustomRange(customStart, e.target.value)}
      className="rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-600 focus:outline-none" />
    <button onClick={() => { if (customStart && customEnd) loadData(); }} disabled={!customStart || !customEnd}
      className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40">
      Aplicar
    </button>
  </div>
)}
```

- [ ] **Step 3: Columnas de rendimiento en Campañas** (tema claro)

`<thead>` tras "Tipo": columnas Clics/Impr./CTR/Conv./CPA con clases `text-gray-500`. En `<tbody>`, antes de la celda de presupuesto, el bloque IIFE con `campaignPerf.get(c.campaignId)` usando clases `text-gray-600`/`text-indexa-gray-dark`. Actualizar el `colSpan` vacío (de `5` a `10`).

- [ ] **Step 4: Columnas de rendimiento en Keywords** (tema claro)

`useEffect` del tab keywords: `if (tab === "keywords" && isConnected) { loadKeywords(); loadKeywordPerf(); }` con deps `[tab, isConnected, loadKeywords, loadKeywordPerf, dateRange, customStart, customEnd]`.
`const kwPerfById = new Map(keywordPerf.map((k) => [k.keywordId, k]));`
Añadir columnas Gasto/Clics/Conv./CPA (tema claro) y el bloque IIFE como en Task 8 Step 4. Actualizar `colSpan` (de `4` a `8`).

- [ ] **Step 5: Verificar build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 6: Verificación manual**

`/admin/campanas/google-ads`: rangos nuevos + personalizado; Campañas y Keywords con métricas y CPA.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/campanas/google-ads/page.tsx
git commit -m "feat(google-ads): admin date ranges (presets + custom) + performance columns"
```

---

## Task 12: Dashboard admin — gráficas, Términos (sub-vista de Segmentos) y exportación

**Files:**
- Modify: `src/app/admin/campanas/google-ads/page.tsx`

- [ ] **Step 1: Imports + branding** (igual a Task 9 Step 1, pero el admin usa marca Indexa fija)

```ts
import { BarChart, Bar, Legend } from "recharts";
import { downloadCSV, generateGoogleAdsPdf } from "@/lib/googleAdsExport";
import { Download, FileText } from "lucide-react";
```
El admin no usa `useBranding` (es tu panel) → en el PDF pasar `brandName: "INDEXA"`, `colorHex: "#002366"`, sin `logoUrl` (o con el logo de Indexa si existe una constante en el repo).

- [ ] **Step 2: Gráficas gasto+conversiones y por campaña** (tema claro)

Reemplazar el `<LineChart>` de "Gasto diario" por la versión doble-eje (colores `#4285F4` y `#34a853`, tooltip claro) y añadir la `<BarChart>` de conversiones por campaña con `campaignChart`, ambos con `contentStyle` claro (`background:#fff`, `border:1px solid #e5e7eb`).

- [ ] **Step 3: Botones CSV + PDF** (en el header)

Añadir `fetchForExport` al destructuring de `useGoogleAdsData` (Task 10 lo omitió). Handlers:
```ts
const handleExportCsv = () => {
  const headers = ["Campaña", "Tipo", "Gasto", "Clics", "Impresiones", "CTR", "Conversiones", "CPA", "Estado"];
  const rows = campaigns.map((c) => {
    const p = campaignPerf.get(c.campaignId);
    return [
      c.campaignName, c.channelType, p?.cost ?? 0, p?.clicks ?? 0, p?.impressions ?? 0,
      p ? Number(p.ctr.toFixed(2)) : 0, p?.conversions ?? 0, p && p.conversions > 0 ? Number(p.cpa.toFixed(2)) : 0, c.status,
    ];
  });
  downloadCSV(`campanas-${dateRange.toLowerCase()}.csv`, headers, rows);
};

const [pdfLoading, setPdfLoading] = useState(false);
const handleExportPdf = async () => {
  setPdfLoading(true);
  try {
    const periodLabel = DATE_RANGES.find((r) => r.value === dateRange)?.label || dateRange;
    const { keywords: kw, searchTerms: st } = await fetchForExport();
    await generateGoogleAdsPdf({
      brandName: "INDEXA",
      logoUrl: undefined,
      colorHex: "#002366",
      accountInfo,
      currency,
      periodLabel: dateRange === "CUSTOM" ? `${customStart} a ${customEnd}` : periodLabel,
      totals,
      campaigns: campaigns.map((c) => {
        const p = campaignPerf.get(c.campaignId);
        return { name: c.campaignName, cost: p?.cost ?? 0, clicks: p?.clicks ?? 0, impressions: p?.impressions ?? 0, ctr: p?.ctr ?? 0, conversions: p?.conversions ?? 0, cpa: p?.cpa ?? 0 };
      }),
      keywords: kw,
      searchTerms: st,
      chart: chartData.map((d) => ({ date: d.date, cost: d.cost })),
      generatedAtLabel: new Date().toLocaleDateString("es-MX"),
    });
  } catch (e) {
    setError(e instanceof Error ? e.message : "Error al generar el PDF.");
  } finally {
    setPdfLoading(false);
  }
};
```
Botones (tema claro, junto a "Actualizar"):
```tsx
<button onClick={handleExportCsv} disabled={!reportRows.length} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40">
  <Download size={13} /> CSV
</button>
<button onClick={handleExportPdf} disabled={!reportRows.length || pdfLoading} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40">
  {pdfLoading ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} Informe PDF
</button>
```

- [ ] **Step 4: Términos como 6ª sub-vista de Segmentos**

Ampliar el tipo de `segView` y el sub-switcher para incluir `"terminos"`:
```ts
const [segView, setSegView] = useState<"hora" | "dispositivo" | "ubicacion" | "audiencias" | "extensiones" | "terminos">("hora");
```
Añadir a `SEG_ACTION` (módulo): `terminos: "search_terms",`
Añadir `"terminos"` al array del sub-switcher `(["hora", ..., "terminos"] as const)`.
El render de la tabla de segmentos es genérico (itera `Object.keys(segRows[0])`), así que `search_terms` se mostrará automáticamente. Añadir botón CSV encima de la tabla de segmentos que exporte `segRows`:
```tsx
<button
  onClick={() => {
    if (!segRows.length) return;
    const headers = Object.keys(segRows[0]);
    const rows = segRows.map((r) => headers.map((h) => (r as Record<string, string | number>)[h]));
    downloadCSV(`segmento-${segView}-${dateRange.toLowerCase()}.csv`, headers, rows);
  }}
  disabled={!segRows.length}
  className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
>
  <Download size={13} /> CSV
</button>
```

- [ ] **Step 5: Verificar build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 6: Verificación manual**

`/admin/campanas/google-ads`: gráficas nuevas; CSV/PDF descargan (PDF marca Indexa); en Segmentos aparece "terminos" con datos y CSV.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/campanas/google-ads/page.tsx
git commit -m "feat(google-ads): admin charts, search-terms segment + CSV/PDF export"
```

---

## Task 13: QA final + cierre de rama

**Files:** ninguno (verificación + git)

- [ ] **Step 1: Build limpio**

Run: `npm run build`
Expected: OK, sin warnings de tipos/lint nuevos.

- [ ] **Step 2: QA manual (con cuenta de Google Ads conectada)**

Checklist en **ambos** dashboards:
- [ ] Rangos: 7/30/90 días, 12 meses, este mes, mes anterior, este año, personalizado → KPIs y gráficas cambian.
- [ ] Personalizado: fechas inválidas (fin futuro, inicio>fin) → mensaje de error claro (400).
- [ ] Campañas: columnas Clics/Impr./CTR/Conv./CPA correctas.
- [ ] Keywords: columnas de rendimiento + Quality Score conviven.
- [ ] Términos de búsqueda: cargan (cliente: tab; admin: sub-vista Segmentos).
- [ ] CSV: campañas y términos descargan archivo abrible en Excel (acentos OK).
- [ ] PDF: descarga con marca correcta (cliente white-label = agencia; cliente directo / admin = Indexa); incluye KPIs, gráfica, campañas, keywords, términos.
- [ ] Acciones existentes (pausar/activar, editar presupuesto en admin, Asistente IA, Segmentos) siguen funcionando.

- [ ] **Step 3: Handoff de integración**

Invocar la skill `superpowers:finishing-a-development-branch` para decidir merge a `master` / PR / limpieza.

---

## Notas de implementación / riesgos

- **`keyword_view` y `search_term_view`** pueden devolver 0 filas en cuentas nuevas o sin tráfico → `.catch(() => [])` ya lo cubre (no rompe la UI).
- **Quality Score con fecha:** se obtiene de `getKeywords()` (atributo actual), no de `keyword_view`, y se hace merge por `keywordId` en el front (evita el matiz de QS segmentado por fecha).
- **Rangos largos (12 meses)** con `segments.date` por campaña devuelven más filas; para pocas campañas es trivial. Si una cuenta tuviera cientos de campañas × 365 días, considerar agregación server-side en una iteración futura (fuera de alcance v1).
- **PDF:** `new Date()` se usa solo en el navegador (handlers de cliente) — válido. El logo se carga con CORS; si falla, el PDF se genera sin logo (degradación elegante).
- **`autoTable`:** se usa la API funcional `autoTable(doc, opts)` (jspdf-autotable v3+) y `doc.lastAutoTable.finalY` con cast tipado (sin `any`).
- **Reglas de commit del repo:** mensajes en el estilo de los commits recientes (`feat(google-ads): …`). No se hace push ni merge sin tu visto bueno (Task 13).
