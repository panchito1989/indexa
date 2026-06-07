"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Loader2, AlertCircle, RefreshCw, ExternalLink,
  Play, Pause, Trash2, DollarSign, MousePointerClick, Eye,
  TrendingUp, Search, Key, BarChart3, Check,
  MessageSquare, Send,
} from "lucide-react";
import GoogleAdsConnect from "@/app/dashboard/google-ads/GoogleAdsConnect";
import type {
  GoogleAdsCampaign, GoogleAdsKeyword, GoogleAdsReportRow,
  GoogleAdsAccountInfo, GoogleAdsAd,
} from "@/lib/googleAdsClient";

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
  { value: "LAST_7_DAYS",  label: "Últimos 7 días"  },
  { value: "LAST_30_DAYS", label: "Últimos 30 días" },
  { value: "THIS_MONTH",   label: "Este mes"         },
  { value: "LAST_MONTH",   label: "Mes anterior"     },
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
};

// ── Main component ─────────────────────────────────────────────────────
export default function AdminGoogleAdsPage() {
  const { user, loading: authLoading } = useAuth();

  const [pageLoading, setPageLoading] = useState(true);

  // Connection state
  const [customerId, setCustomerId] = useState("");
  const [accountInfo, setAccountInfo] = useState<GoogleAdsAccountInfo | null>(null);

  // Data
  const [tab, setTab] = useState<Tab>("resumen");
  const [dateRange, setDateRange] = useState("LAST_7_DAYS");
  const [campaigns, setCampaigns] = useState<GoogleAdsCampaign[]>([]);
  const [keywords, setKeywords] = useState<GoogleAdsKeyword[]>([]);
  const [reportRows, setReportRows] = useState<GoogleAdsReportRow[]>([]);
  const [ads, setAds] = useState<GoogleAdsAd[]>([]);
  const [segView, setSegView] = useState<"hora" | "dispositivo" | "ubicacion" | "audiencias" | "extensiones">("hora");
  const [segRows, setSegRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Budget editing
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [budgetInput, setBudgetInput] = useState("");

  // AI assistant
  const [aiHistory, setAiHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const isConnected = !!customerId;

  // ── Load tokens on mount ─────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !user) return;
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
        console.error("[admin google-ads]", e);
      } finally {
        setPageLoading(false);
      }
    })();
  }, [user, authLoading]);

  // ── API helpers ──────────────────────────────────────────────────
  const apiFetch = useCallback(async (action: string, params: Record<string, string> = {}) => {
    if (!user) return null;
    const idToken = await user.getIdToken();
    const qs = new URLSearchParams({ action, ...params });
    const res = await fetch(`/api/google-ads?${qs}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
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

  // ── Load main data ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    setError("");
    try {
      const [info, campaignData, reportData] = await Promise.all([
        apiFetch("account_info"),
        apiFetch("campaigns"),
        apiFetch("reporting", { dateRange }),
      ]);
      if (info?.info) setAccountInfo(info.info);
      if (campaignData?.campaigns) setCampaigns(campaignData.campaigns);
      if (reportData?.rows) setReportRows(reportData.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos.");
    } finally {
      setLoading(false);
    }
  }, [isConnected, apiFetch, dateRange]);

  useEffect(() => {
    if (isConnected) loadData();
  }, [isConnected, loadData]);

  // ── Load keywords ────────────────────────────────────────────────
  const loadKeywords = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    try {
      const data = await apiFetch("keywords");
      if (data?.keywords) setKeywords(data.keywords);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar keywords.");
    } finally {
      setLoading(false);
    }
  }, [isConnected, apiFetch]);

  useEffect(() => {
    if (tab === "keywords" && isConnected) loadKeywords();
  }, [tab, isConnected, loadKeywords]);

  // ── Load ads ─────────────────────────────────────────────────────
  const loadAds = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    try {
      const data = await apiFetch("ads");
      if (data?.ads) setAds(data.ads);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar anuncios.");
    } finally {
      setLoading(false);
    }
  }, [isConnected, apiFetch]);

  useEffect(() => {
    if (tab === "anuncios" && isConnected) loadAds();
  }, [tab, isConnected, loadAds]);

  // ── Load segment ─────────────────────────────────────────────────
  const loadSegment = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    try {
      const data = await apiFetch(SEG_ACTION[segView], { dateRange });
      setSegRows(data?.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar segmento.");
    } finally {
      setLoading(false);
    }
  }, [isConnected, apiFetch, segView, dateRange]);

  useEffect(() => {
    if (tab === "segmentos" && isConnected) loadSegment();
  }, [tab, isConnected, loadSegment]);

  // ── Campaign actions ─────────────────────────────────────────────
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
  }, [apiPost]);

  // ── Budget editing ────────────────────────────────────────────────
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
  }, [apiPost, budgetInput]);

  // ── AI assistant ─────────────────────────────────────────────────
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

  // ── Reporting aggregation ─────────────────────────────────────────
  const reportByDate = reportRows.reduce<
    Record<string, { date: string; cost: number; clicks: number; impressions: number }>
  >((acc, r) => {
    if (!acc[r.date]) acc[r.date] = { date: r.date, cost: 0, clicks: 0, impressions: 0 };
    acc[r.date].cost += r.cost;
    acc[r.date].clicks += r.clicks;
    acc[r.date].impressions += r.impressions;
    return acc;
  }, {});
  const chartData = Object.values(reportByDate).sort((a, b) => a.date.localeCompare(b.date));
  const totalSpend = reportRows.reduce((s, r) => s + r.cost, 0);
  const totalClicks = reportRows.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = reportRows.reduce((s, r) => s + r.impressions, 0);
  const totalConversions = reportRows.reduce((s, r) => s + r.conversions, 0);
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const currency = accountInfo?.currencyCode ?? "MXN";

  // ── Loading state ─────────────────────────────────────────────────
  if (pageLoading || authLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  // ── Not connected ─────────────────────────────────────────────────
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

  // ── Connected dashboard ───────────────────────────────────────────
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
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 focus:outline-none"
          >
            {DATE_RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Actualizar
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
              { label: "Gasto",        value: fmtMoney(totalSpend, currency),  icon: DollarSign,       color: "text-emerald-600" },
              { label: "Clics",        value: fmtNum(totalClicks),             icon: MousePointerClick, color: "text-[#4285F4]"  },
              { label: "Impresiones",  value: fmtNum(totalImpressions),        icon: Eye,               color: "text-purple-500" },
              { label: "CTR",          value: `${avgCtr.toFixed(2)}%`,         icon: TrendingUp,        color: "text-amber-500"  },
              { label: "CPC prom.",    value: fmtMoney(avgCpc, currency),      icon: BarChart3,         color: "text-pink-500"   },
              { label: "Conversiones", value: fmtNum(totalConversions),        icon: Check,             color: "text-cyan-600"   },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <kpi.icon size={16} className={`mb-2 ${kpi.color}`} />
                <p className="text-[11px] text-gray-500">{kpi.label}</p>
                <p className="text-lg font-bold text-indexa-gray-dark">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-gray-700">Gasto diario</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#374151" }}
                  />
                  <Line type="monotone" dataKey="cost" stroke="#4285F4" strokeWidth={2} dot={false} name="Gasto" />
                </LineChart>
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
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">Presup./día</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Estado</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                    {loading ? "Cargando campañas…" : "No hay campañas activas."}
                  </td>
                </tr>
              )}
              {campaigns.map((c) => {
                const s = campaignStatusLabel(c.status);
                const isLoading = actionLoading === c.campaignId;
                const isEditingThis = editingBudget === c.campaignId;
                return (
                  <tr key={c.campaignId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-indexa-gray-dark">{c.campaignName}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{c.channelType}</td>
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
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keywords.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                    {loading ? "Cargando keywords…" : "No hay keywords."}
                  </td>
                </tr>
              )}
              {keywords.map((kw) => (
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
              ))}
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
                    {loading ? "Cargando anuncios…" : "No hay anuncios."}
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
            {(["hora", "dispositivo", "ubicacion", "audiencias", "extensiones"] as const).map((v) => (
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
