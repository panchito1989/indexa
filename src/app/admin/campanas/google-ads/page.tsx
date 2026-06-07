"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from "recharts";
import {
  Loader2, AlertCircle, RefreshCw, ExternalLink,
  Play, Pause, Trash2, DollarSign, MousePointerClick, Eye,
  TrendingUp, Search, Key, BarChart3, Check,
  MessageSquare, Send, Download, FileText,
} from "lucide-react";
import GoogleAdsConnect from "@/app/dashboard/google-ads/GoogleAdsConnect";
import type {
  GoogleAdsCampaign, GoogleAdsAd,
} from "@/lib/googleAdsClient";
import { useGoogleAdsData } from "@/lib/useGoogleAdsData";
import { downloadCSV, generateGoogleAdsPdf } from "@/lib/googleAdsExport";

// ── Types ─────────────────────────────────────────────────────────────
type Tab = "resumen" | "campanas" | "keywords" | "anuncios" | "ia" | "segmentos";

// ── Helpers ───────────────────────────────────────────────────────────
function fmtMoney(val: number, currency = "MXN"): string {
  return val.toLocaleString("es-MX", { style: "currency", currency, maximumFractionDigits: 2 });
}

function fmtNum(val: number): string {
  return val.toLocaleString("es-MX");
}

function campaignStatusLabel(status: string): { text: string; color: string; bg: string } {
  switch (status) {
    case "ENABLED":  return { text: "Activa",    color: "text-emerald-700", bg: "bg-emerald-50"  };
    case "PAUSED":   return { text: "Pausada",   color: "text-amber-700",   bg: "bg-amber-50"    };
    case "REMOVED":  return { text: "Eliminada", color: "text-gray-400",    bg: "bg-gray-100"    };
    default:         return { text: status,      color: "text-gray-400",    bg: "bg-gray-100"    };
  }
}

function matchTypeLabel(t: string): string {
  return ({ EXACT: "Exacta", PHRASE: "Frase", BROAD: "Amplia" } as Record<string, string>)[t] ?? t;
}

const DATE_RANGES = [
  { value: "LAST_7_DAYS",    label: "Últimos 7 días"   },
  { value: "LAST_30_DAYS",   label: "Últimos 30 días"  },
  { value: "LAST_90_DAYS",   label: "Últimos 90 días"  },
  { value: "LAST_12_MONTHS", label: "Últimos 12 meses" },
  { value: "THIS_MONTH",     label: "Este mes"          },
  { value: "LAST_MONTH",     label: "Mes anterior"      },
  { value: "THIS_YEAR",      label: "Este año"          },
  { value: "CUSTOM",         label: "Personalizado…"    },
];

const TAB_LABELS: Record<Tab, string> = {
  resumen: "Resumen",
  campanas: "Campañas",
  keywords: "Palabras clave",
  anuncios: "Anuncios",
  ia: "Asistente IA",
  segmentos: "Segmentos",
};

// ── Segment action map (module scope to avoid hooks/deps lint) ─────────
const SEG_ACTION: Record<string, string> = {
  hora: "hourly",
  dispositivo: "device",
  ubicacion: "geo",
  audiencias: "audiences",
  extensiones: "extensions",
  terminos: "search_terms",
};

// ── Main component ─────────────────────────────────────────────────────
export default function AdminGoogleAdsPage() {
  const { user, loading: authLoading } = useAuth();

  const [pageLoading, setPageLoading] = useState(true);

  // ── Hook ─────────────────────────────────────────────────────────────
  const {
    customerId, setCustomerId, accountInfo, currency, isConnected,
    dateRange, setDateRange, customStart, customEnd, setCustomRange,
    campaigns, setCampaigns, keywords, reportRows, keywordPerf, segRows,
    totals, campaignPerf, chartData, campaignChart,
    loading, error, setError,
    loadData, loadKeywords, loadKeywordPerf, loadSegment, apiPost, fetchForExport,
  } = useGoogleAdsData();

  // ── Page-local state ─────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>("resumen");
  const [segView, setSegView] = useState<"hora" | "dispositivo" | "ubicacion" | "audiencias" | "extensiones" | "terminos">("hora");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Budget editing
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [budgetInput, setBudgetInput] = useState("");

  // AI assistant
  const [aiHistory, setAiHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Ads tab (local — hook does not provide ads)
  const [ads, setAds] = useState<GoogleAdsAd[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);

  // PDF export
  const [pdfLoading, setPdfLoading] = useState(false);

  // ── Clear pageLoading once auth is settled ───────────────────────────
  // The hook loads customerId internally; we just wait for auth to resolve.
  // Clear regardless of whether a user exists, so an unauthenticated visit
  // doesn't get stuck on the spinner forever.
  useEffect(() => {
    if (authLoading) return;
    setPageLoading(false);
  }, [authLoading]);

  // ── Load ads ─────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (tab === "anuncios" && isConnected) loadAds();
  }, [tab, isConnected, loadAds]);

  // ── Load keywords + perf ─────────────────────────────────────────────
  useEffect(() => {
    if (tab === "keywords" && isConnected) {
      loadKeywords();
      loadKeywordPerf();
    }
  }, [tab, isConnected, loadKeywords, loadKeywordPerf, dateRange, customStart, customEnd]);

  // ── Load segment ─────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === "segmentos" && isConnected) loadSegment(SEG_ACTION[segView]);
  }, [tab, isConnected, loadSegment, segView, dateRange, customStart, customEnd]);

  // ── Campaign actions ─────────────────────────────────────────────────
  const toggleCampaign = useCallback(async (campaign: GoogleAdsCampaign) => {
    const newAction = campaign.status === "ENABLED" ? "pause" : "enable";
    setActionLoading(campaign.campaignId);
    try {
      await apiPost({ action: newAction, campaignResourceName: campaign.resourceName });
      setCampaigns((prev) =>
        prev.map((c) =>
          c.campaignId === campaign.campaignId
            ? { ...c, status: newAction === "pause" ? "PAUSED" : "ENABLED" }
            : c
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cambiar estado.");
    } finally {
      setActionLoading(null);
    }
  }, [apiPost, setCampaigns, setError]);

  // ── Budget editing ────────────────────────────────────────────────────
  const saveBudget = useCallback(async (c: GoogleAdsCampaign) => {
    const amount = parseFloat(budgetInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Presupuesto inválido.");
      return;
    }
    setActionLoading(c.campaignId);
    try {
      await apiPost({
        action: "update_budget",
        budgetResourceName: c.budgetResourceName,
        amountMicros: Math.round(amount * 1_000_000),
      });
      setCampaigns((prev) =>
        prev.map((x) =>
          x.campaignId === c.campaignId
            ? { ...x, dailyBudget: amount, dailyBudgetMicros: Math.round(amount * 1_000_000) }
            : x
        )
      );
      setEditingBudget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar presupuesto.");
    } finally {
      setActionLoading(null);
    }
  }, [apiPost, budgetInput, setCampaigns, setError]);

  // ── AI assistant ─────────────────────────────────────────────────────
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
        body: JSON.stringify({
          message: userMsg,
          history: aiHistory.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error del asistente.");
      if (Array.isArray(data.history)) {
        setAiHistory(
          (data.history as Array<{ role: "user" | "assistant"; content: unknown }>).map((m) => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : String(data.reply ?? ""),
          }))
        );
      } else {
        setAiHistory((h) => [...h, { role: "assistant", content: data.reply ?? "" }]);
      }
    } catch (e) {
      setAiHistory((h) => [
        ...h,
        { role: "assistant", content: `⚠️ ${e instanceof Error ? e.message : "Error"}` },
      ]);
    } finally {
      setAiLoading(false);
    }
  }, [user, aiInput, aiLoading, aiHistory]);

  // ── Export handlers ───────────────────────────────────────────────────
  const handleExportCsv = () => {
    const headers = ["Campaña", "Tipo", "Gasto", "Clics", "Impresiones", "CTR", "Conversiones", "CPA", "Estado"];
    const rows = campaigns.map((c) => {
      const p = campaignPerf.get(c.campaignId);
      return [
        c.campaignName, c.channelType, p?.cost ?? 0, p?.clicks ?? 0, p?.impressions ?? 0,
        p ? Number(p.ctr.toFixed(2)) : 0, p?.conversions ?? 0,
        p && p.conversions > 0 ? Number(p.cpa.toFixed(2)) : 0, c.status,
      ];
    });
    downloadCSV(`campanas-${dateRange.toLowerCase()}.csv`, headers, rows);
  };

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
          return {
            name: c.campaignName,
            cost: p?.cost ?? 0,
            clicks: p?.clicks ?? 0,
            impressions: p?.impressions ?? 0,
            ctr: p?.ctr ?? 0,
            conversions: p?.conversions ?? 0,
            cpa: p?.cpa ?? 0,
          };
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

  // ── Keyword perf map ──────────────────────────────────────────────────
  const kwPerfById = new Map(keywordPerf.map((k) => [k.keywordId, k]));

  // ── Loading state ─────────────────────────────────────────────────────
  if (pageLoading || authLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  // ── Not connected ─────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-indexa-gray-dark">Google Ads</h2>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona campañas de Google Ads directamente desde el panel de administración.
          </p>
        </div>
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4285F4]/10">
                <Key size={24} className="text-[#4285F4]" />
              </div>
            </div>
            <h2 className="mb-2 text-lg font-bold text-indexa-gray-dark">Conecta Google Ads</h2>
            <p className="mb-6 text-sm text-gray-500">
              Autoriza a Indexa para ver y gestionar las campañas de Google Ads del cliente.
            </p>
            <GoogleAdsConnect
              onConnected={async () => {
                if (!user) return;
                const idToken = await user.getIdToken();
                const res = await fetch("/api/tokens", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                  body: JSON.stringify({ action: "load" }),
                });
                const { tokens } = await res.json();
                if (tokens?.googleAdsCustomerId) setCustomerId(tokens.googleAdsCustomerId);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Connected dashboard ───────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-indexa-gray-dark">Google Ads</h2>
          {accountInfo && (
            <p className="mt-0.5 text-sm text-gray-500">
              {accountInfo.descriptiveName} · {accountInfo.customerId} · {accountInfo.currencyCode}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 focus:outline-none"
          >
            {DATE_RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          {dateRange === "CUSTOM" && (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(e) => setCustomRange(e.target.value, customEnd)}
                className="rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-600 focus:outline-none"
              />
              <span className="text-gray-400 text-xs">→</span>
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(e) => setCustomRange(customStart, e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-600 focus:outline-none"
              />
              <button
                onClick={() => { if (customStart && customEnd) loadData(); }}
                disabled={!customStart || !customEnd}
                className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                Aplicar
              </button>
            </div>
          )}

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>

          <button
            onClick={handleExportCsv}
            disabled={!reportRows.length}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            <Download size={13} /> CSV
          </button>

          <button
            onClick={handleExportPdf}
            disabled={!reportRows.length || pdfLoading}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            {pdfLoading ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} Informe PDF
          </button>

          <a
            href={`https://ads.google.com/aw/overview?ocid=${customerId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            <ExternalLink size={13} /> Google Ads
          </a>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-600">
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-1">
        {(["resumen", "campanas", "keywords", "anuncios", "ia", "segmentos"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl py-2 px-3 text-xs font-semibold transition-all ${
              tab === t
                ? "bg-[#4285F4]/10 text-[#4285F4]"
                : "text-gray-500 hover:text-indexa-gray-dark"
            }`}
          >
            {t === "ia" && <MessageSquare size={13} />}
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ── Resumen ── */}
      {tab === "resumen" && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Gasto",        value: fmtMoney(totals.spend, currency),        icon: DollarSign,        color: "text-emerald-600" },
              { label: "Clics",        value: fmtNum(totals.clicks),                   icon: MousePointerClick, color: "text-[#4285F4]"  },
              { label: "Impresiones",  value: fmtNum(totals.impressions),              icon: Eye,               color: "text-purple-500" },
              { label: "CTR",          value: `${totals.ctr.toFixed(2)}%`,             icon: TrendingUp,        color: "text-amber-500"  },
              { label: "CPC prom.",    value: fmtMoney(totals.cpc, currency),          icon: BarChart3,         color: "text-pink-500"   },
              { label: "Conversiones", value: fmtNum(totals.conversions),              icon: Check,             color: "text-cyan-600"   },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <kpi.icon size={16} className={`mb-2 ${kpi.color}`} />
                <p className="text-[11px] text-gray-500">{kpi.label}</p>
                <p className="text-lg font-bold text-indexa-gray-dark">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Chart: Gasto + Conversiones */}
          {chartData.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-gray-700">Gasto y conversiones</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#374151" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="left" type="monotone" dataKey="cost" stroke="#4285F4" strokeWidth={2} dot={false} name="Gasto" />
                  <Line yAxisId="right" type="monotone" dataKey="conversions" stroke="#34a853" strokeWidth={2} dot={false} name="Conversiones" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Chart: Conversiones por campaña */}
          {campaignChart.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-gray-700">Conversiones por campaña</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={campaignChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#6b7280" }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="conversions" fill="#34a853" name="Conversiones" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Billing shortcut */}
          <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-indexa-gray-dark">Saldo y facturación</p>
              <p className="text-xs text-gray-500">El recargo de saldo se gestiona directamente en Google Ads.</p>
            </div>
            <a
              href={`https://ads.google.com/aw/billing/overview?ocid=${customerId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-[#4285F4]/10 px-4 py-2 text-sm font-semibold text-[#4285F4] hover:bg-[#4285F4]/20"
            >
              Recargar saldo <ExternalLink size={14} />
            </a>
          </div>
        </div>
      )}

      {/* ── Campañas ── */}
      {tab === "campanas" && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Campaña</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tipo</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">Clics</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">Impr.</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">CTR</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">Conv.</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">CPA</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">Presup./día</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Estado</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400">
                    {loading ? "Cargando campañas…" : "No hay campañas activas."}
                  </td>
                </tr>
              )}
              {campaigns.map((c) => {
                const s = campaignStatusLabel(c.status);
                const isLoading = actionLoading === c.campaignId;
                const isEditingThis = editingBudget === c.campaignId;
                const p = campaignPerf.get(c.campaignId);
                return (
                  <tr key={c.campaignId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-indexa-gray-dark">{c.campaignName}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{c.channelType}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{p ? fmtNum(p.clicks) : "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{p ? fmtNum(p.impressions) : "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{p ? `${p.ctr.toFixed(2)}%` : "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{p ? fmtNum(p.conversions) : "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{p && p.conversions > 0 ? fmtMoney(p.cpa, currency) : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {isEditingThis ? (
                        <div className="inline-flex items-center gap-1.5">
                          <input
                            type="number"
                            value={budgetInput}
                            onChange={(e) => setBudgetInput(e.target.value)}
                            className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-xs text-indexa-gray-dark focus:border-[#4285F4] focus:outline-none"
                            min="0.01"
                            step="0.01"
                          />
                          <button
                            onClick={() => saveBudget(c)}
                            disabled={isLoading}
                            className="rounded-lg bg-[#4285F4] px-2 py-1 text-[10px] font-semibold text-white hover:bg-[#3367d6] disabled:opacity-50"
                          >
                            {isLoading ? <Loader2 size={10} className="animate-spin" /> : "Guardar"}
                          </button>
                          <button
                            onClick={() => setEditingBudget(null)}
                            className="rounded-lg border border-gray-200 px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingBudget(c.campaignId); setBudgetInput(String(c.dailyBudget)); }}
                          className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          {fmtMoney(c.dailyBudget, currency)}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.bg} ${s.color}`}>
                        {s.text}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleCampaign(c)}
                        disabled={isLoading || c.status === "REMOVED"}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                      >
                        {isLoading ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : c.status === "ENABLED" ? (
                          <><Pause size={12} /> Pausar</>
                        ) : (
                          <><Play size={12} /> Activar</>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Keywords ── */}
      {tab === "keywords" && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Keyword</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tipo de concordancia</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">Quality Score</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">Gasto</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">Clics</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">Conv.</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">CPA</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keywords.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                    {loading ? "Cargando keywords…" : "No hay keywords."}
                  </td>
                </tr>
              )}
              {keywords.map((kw) => {
                const p = kwPerfById.get(kw.keywordId);
                return (
                  <tr key={kw.keywordId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-indexa-gray-dark">
                      <div className="flex items-center gap-2">
                        <Search size={12} className="text-gray-400" />
                        {kw.text}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                        {matchTypeLabel(kw.matchType)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {kw.qualityScore !== null ? (
                        <span className={`font-bold ${
                          kw.qualityScore >= 7
                            ? "text-emerald-600"
                            : kw.qualityScore >= 4
                            ? "text-amber-600"
                            : "text-red-600"
                        }`}>
                          {kw.qualityScore}/10
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{p ? fmtMoney(p.cost, currency) : "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{p ? fmtNum(p.clicks) : "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{p ? fmtNum(p.conversions) : "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{p && p.conversions > 0 ? fmtMoney(p.costPerConversion, currency) : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        kw.status === "ENABLED"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}>
                        {kw.status === "ENABLED" ? "Activa" : "Pausada"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Anuncios ── */}
      {tab === "anuncios" && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Anuncio</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tipo</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Estado</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ads.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                    {adsLoading ? "Cargando anuncios…" : "No hay anuncios."}
                  </td>
                </tr>
              )}
              {ads.map((a) => {
                const s = campaignStatusLabel(a.status);
                return (
                  <tr key={a.adId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-indexa-gray-dark">{a.adName}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{a.adType}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.bg} ${s.color}`}>
                        {s.text}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{a.adId}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Segmentos ── */}
      {tab === "segmentos" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["hora", "dispositivo", "ubicacion", "audiencias", "extensiones", "terminos"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setSegView(v)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
                  segView === v
                    ? "bg-[#4285F4] text-white"
                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex justify-end">
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
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {(segRows[0] ? Object.keys(segRows[0]) : []).map((k) => (
                    <th
                      key={k}
                      className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {segRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={Math.max(1, segRows[0] ? Object.keys(segRows[0]).length : 1)}
                      className="px-4 py-8 text-center text-sm text-gray-400"
                    >
                      {loading ? "Cargando…" : "Sin datos para este segmento."}
                    </td>
                  </tr>
                )}
                {segRows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {Object.entries(row).map(([k, val]) => (
                      <td key={k} className="px-4 py-3 text-indexa-gray-dark">
                        {typeof val === "number"
                          ? /(cost|cpc)/i.test(k)
                            ? fmtMoney(val, currency)
                            : fmtNum(val)
                          : String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Asistente IA ── */}
      {tab === "ia" && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h3 className="text-sm font-bold text-indexa-gray-dark">Asistente IA — Google Ads</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Pregúntame sobre el rendimiento de tus campañas, optimizaciones o análisis.
            </p>
          </div>

          {/* Message list */}
          <div className="flex h-[calc(60vh-120px)] min-h-[320px] flex-col gap-3 overflow-y-auto px-5 py-4">
            {aiHistory.length === 0 && !aiLoading && (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-center text-sm text-gray-400">
                  Pregúntame: &ldquo;analiza el rendimiento de mis campañas&rdquo;.
                </p>
              </div>
            )}
            {aiHistory.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === "user"
                      ? "bg-[#4285F4] text-white"
                      : "bg-gray-100 text-indexa-gray-dark"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-gray-100 px-4 py-2.5">
                  <Loader2 size={14} className="animate-spin text-gray-400" />
                  <span className="text-sm text-gray-400">Pensando…</span>
                </div>
              </div>
            )}
          </div>

          {/* Input row */}
          <div className="border-t border-gray-200 px-5 py-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAi(); } }}
                placeholder="Escribe tu pregunta…"
                disabled={aiLoading}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-indexa-gray-dark placeholder:text-gray-400 focus:border-[#4285F4] focus:outline-none focus:ring-2 focus:ring-[#4285F4]/20 disabled:opacity-50"
              />
              <button
                onClick={sendAi}
                disabled={aiLoading || !aiInput.trim()}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#4285F4] text-white hover:bg-[#3367d6] disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
