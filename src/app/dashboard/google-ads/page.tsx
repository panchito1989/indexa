"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import type { SitioData, UserProfile } from "@/types/lead";
import { PaywallOverlay, PaywallModal } from "@/components/PaywallGate";
import { motion } from "framer-motion";
import {
  Loader2, AlertCircle, RefreshCw, ExternalLink, ChevronLeft,
  Play, Pause, Trash2, DollarSign, MousePointerClick, Eye,
  TrendingUp, Search, Key, BarChart3, Check,
} from "lucide-react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import GoogleAdsConnect from "./GoogleAdsConnect";
import type {
  GoogleAdsCampaign, GoogleAdsKeyword, GoogleAdsReportRow, GoogleAdsAccountInfo,
} from "@/lib/googleAdsClient";

// ── Types ─────────────────────────────────────────────────────────────
type Tab = "resumen" | "campanas" | "keywords" | "anuncios";

// ── Helpers ───────────────────────────────────────────────────────────
function fmtMoney(val: number, currency = "MXN"): string {
  return val.toLocaleString("es-MX", { style: "currency", currency, maximumFractionDigits: 2 });
}

function fmtNum(val: number): string {
  return val.toLocaleString("es-MX");
}

function campaignStatusLabel(status: string): { text: string; color: string; bg: string } {
  switch (status) {
    case "ENABLED":  return { text: "Activa",    color: "text-emerald-400", bg: "bg-emerald-500/10" };
    case "PAUSED":   return { text: "Pausada",   color: "text-amber-400",   bg: "bg-amber-500/10"  };
    case "REMOVED":  return { text: "Eliminada", color: "text-white/40",    bg: "bg-white/5"       };
    default:         return { text: status,      color: "text-white/40",    bg: "bg-white/5"       };
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

// ── Main component ─────────────────────────────────────────────────────
export default function GoogleAdsDashboard() {
  const { user, loading: authLoading, role: authRole } = useAuth();

  const [pageLoading, setPageLoading] = useState(true);
  const [sitio, setSitio] = useState<SitioData | null>(null);
  const [sitioId, setSitioId] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState("");

  // Connection state
  const [customerId, setCustomerId] = useState("");
  const [accountInfo, setAccountInfo] = useState<GoogleAdsAccountInfo | null>(null);

  // Data
  const [tab, setTab] = useState<Tab>("resumen");
  const [dateRange, setDateRange] = useState("LAST_7_DAYS");
  const [campaigns, setCampaigns] = useState<GoogleAdsCampaign[]>([]);
  const [keywords, setKeywords] = useState<GoogleAdsKeyword[]>([]);
  const [reportRows, setReportRows] = useState<GoogleAdsReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const isActive = sitio?.statusPago === "activo" || authRole === "superadmin";
  const isConnected = !!customerId;

  // ── Load user + sitio ────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !user || !db) return;
    const _db = db;
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const [tokensRes, profileSnap] = await Promise.all([
          fetch("/api/tokens", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({ action: "load" }),
          }),
          getDoc(doc(_db, "usuarios", user.uid)),
        ]);

        const { tokens } = await tokensRes.json();
        if (tokens?.googleAdsCustomerId) setCustomerId(tokens.googleAdsCustomerId);

        const profileData = profileSnap.data() as UserProfile | undefined;
        if (profileData?.sitioId) {
          setSitioId(profileData.sitioId);
          const sitioSnap = await getDoc(doc(_db, "sitios", profileData.sitioId));
          if (sitioSnap.exists()) setSitio(sitioSnap.data() as SitioData);
        }
      } catch (e) {
        console.error("[google-ads dashboard]", e);
      } finally {
        setPageLoading(false);
      }
    })();
  }, [user, authLoading]);

  // ── API helper ───────────────────────────────────────────────────
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

  // ── Load data ────────────────────────────────────────────────────
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

  // ── Reporting aggregation ─────────────────────────────────────────
  const reportByDate = reportRows.reduce<Record<string, { date: string; cost: number; clicks: number; impressions: number }>>((acc, r) => {
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

  // ── Paywall guard ─────────────────────────────────────────────────
  const requireActive = (feature: string, action: () => void) => {
    if (!isActive) { setPaywallFeature(feature); setShowPaywall(true); return; }
    action();
  };

  if (pageLoading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
        <Loader2 size={28} className="animate-spin text-white/40" />
      </div>
    );
  }

  // ── Not connected ─────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] px-4 py-12">
        <div className="mx-auto max-w-md">
          <Link href="/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm text-white/40 hover:text-white">
            <ChevronLeft size={16} /> Dashboard
          </Link>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4285F4]/15">
                <Key size={24} className="text-[#4285F4]" />
              </div>
            </div>
            <h2 className="mb-2 text-lg font-bold text-white">Conecta Google Ads</h2>
            <p className="mb-6 text-sm text-white/50">
              Autoriza a Indexa para ver y gestionar tus campañas de Google Ads directamente desde el dashboard.
            </p>
            {!isActive && (
              <div className="mb-4">
                <PaywallOverlay
                  locked={true}
                  featureName="Google Ads"
                  sitioId={sitioId}
                >
                  <GoogleAdsConnect onConnected={() => { setCustomerId("loading"); loadData(); }} />
                </PaywallOverlay>
              </div>
            )}
            {isActive && (
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
            )}
          </div>
        </div>
        {showPaywall && (
          <PaywallModal
            open={showPaywall}
            featureName={paywallFeature}
            sitioId={sitioId}
            onClose={() => setShowPaywall(false)}
          />
        )}
      </div>
    );
  }

  // ── Connected dashboard ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0f] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-white/40 hover:text-white">
              <ChevronLeft size={20} />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">Google Ads</h1>
              {accountInfo && (
                <p className="text-xs text-white/40">
                  {accountInfo.descriptiveName} · {accountInfo.customerId} · {accountInfo.currencyCode}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 focus:outline-none"
            >
              {DATE_RANGES.map((r) => (
                <option key={r.value} value={r.value} className="bg-[#0f0f17]">{r.label}</option>
              ))}
            </select>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Actualizar
            </button>
            <a
              href={`https://ads.google.com/aw/overview?ocid=${customerId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
            >
              <ExternalLink size={13} /> Google Ads
            </a>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertCircle size={16} /> {error}
            <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-200"><Trash2 size={14} /></button>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          {(["resumen", "campanas", "keywords", "anuncios"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-xl py-2 text-xs font-semibold capitalize transition-all ${
                tab === t ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              {t === "campanas" ? "Campañas" : t === "keywords" ? "Palabras clave" : t === "anuncios" ? "Anuncios" : "Resumen"}
            </button>
          ))}
        </div>

        {/* ── Resumen ── */}
        {tab === "resumen" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* KPI Cards */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "Gasto", value: fmtMoney(totalSpend, currency), icon: DollarSign, color: "text-emerald-400" },
                { label: "Clics", value: fmtNum(totalClicks), icon: MousePointerClick, color: "text-[#4285F4]" },
                { label: "Impresiones", value: fmtNum(totalImpressions), icon: Eye, color: "text-purple-400" },
                { label: "CTR", value: `${avgCtr.toFixed(2)}%`, icon: TrendingUp, color: "text-amber-400" },
                { label: "CPC prom.", value: fmtMoney(avgCpc, currency), icon: BarChart3, color: "text-pink-400" },
                { label: "Conversiones", value: fmtNum(totalConversions), icon: Check, color: "text-cyan-400" },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <kpi.icon size={16} className={`mb-2 ${kpi.color}`} />
                  <p className="text-[11px] text-white/40">{kpi.label}</p>
                  <p className="text-lg font-bold text-white">{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Chart */}
            {chartData.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="mb-4 text-sm font-semibold text-white/70">Gasto diario</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <Tooltip
                      contentStyle={{ background: "#0f0f17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                      labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                    />
                    <Line type="monotone" dataKey="cost" stroke="#4285F4" strokeWidth={2} dot={false} name="Gasto" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Billing shortcut */}
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-white">Saldo y facturación</p>
                <p className="text-xs text-white/40">El recargo de saldo se gestiona directamente en Google Ads.</p>
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
          </motion.div>
        )}

        {/* ── Campañas ── */}
        {tab === "campanas" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Campaña</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Tipo</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Presup./día</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Estado</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {campaigns.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-white/30">
                        {loading ? "Cargando campañas…" : "No hay campañas activas."}
                      </td>
                    </tr>
                  )}
                  {campaigns.map((c) => {
                    const s = campaignStatusLabel(c.status);
                    const isLoading = actionLoading === c.campaignId;
                    return (
                      <tr key={c.campaignId} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium text-white">{c.campaignName}</td>
                        <td className="px-4 py-3 text-xs text-white/50">{c.channelType}</td>
                        <td className="px-4 py-3 text-right text-white/70">
                          {fmtMoney(c.dailyBudget, currency)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.bg} ${s.color}`}>
                            {s.text}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => requireActive("Google Ads", () => toggleCampaign(c))}
                            disabled={isLoading || c.status === "REMOVED"}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/5 disabled:opacity-40"
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
          </motion.div>
        )}

        {/* ── Keywords ── */}
        {tab === "keywords" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Keyword</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Tipo de concordancia</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-white/40">Quality Score</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {keywords.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-white/30">
                        {loading ? "Cargando keywords…" : "No hay keywords."}
                      </td>
                    </tr>
                  )}
                  {keywords.map((kw) => (
                    <tr key={kw.keywordId} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <Search size={12} className="text-white/30" />
                          {kw.text}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/50">
                          {matchTypeLabel(kw.matchType)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {kw.qualityScore !== null ? (
                          <span className={`font-bold ${kw.qualityScore >= 7 ? "text-emerald-400" : kw.qualityScore >= 4 ? "text-amber-400" : "text-red-400"}`}>
                            {kw.qualityScore}/10
                          </span>
                        ) : (
                          <span className="text-white/20">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          kw.status === "ENABLED" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                        }`}>
                          {kw.status === "ENABLED" ? "Activa" : "Pausada"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* ── Anuncios ── */}
        {tab === "anuncios" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
              <p className="text-sm text-white/40">
                Los anuncios se cargan desde las campañas. Selecciona una campaña en la pestaña{" "}
                <button onClick={() => setTab("campanas")} className="text-[#4285F4] underline">Campañas</button>{" "}
                para ver sus anuncios.
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {showPaywall && (
        <PaywallModal
          open={showPaywall}
          featureName={paywallFeature}
          sitioId={sitioId}
          onClose={() => setShowPaywall(false)}
        />
      )}
    </div>
  );
}
