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
