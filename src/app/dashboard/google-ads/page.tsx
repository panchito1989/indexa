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
  TrendingUp, Search, Key, BarChart3, Check, Download, FileText, LogOut,
} from "lucide-react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from "recharts";
import GoogleAdsConnect from "./GoogleAdsConnect";
import type { GoogleAdsCampaign } from "@/lib/googleAdsClient";
import { useGoogleAdsData } from "@/lib/useGoogleAdsData";
import { downloadCSV, generateGoogleAdsPdf } from "@/lib/googleAdsExport";
import { useBranding } from "@/lib/BrandingContext";

// ── Types ─────────────────────────────────────────────────────────────
type Tab = "resumen" | "campanas" | "keywords" | "anuncios" | "terminos";

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
  { value: "LAST_7_DAYS",    label: "Últimos 7 días"   },
  { value: "LAST_30_DAYS",   label: "Últimos 30 días"  },
  { value: "LAST_90_DAYS",   label: "Últimos 90 días"  },
  { value: "LAST_12_MONTHS", label: "Últimos 12 meses" },
  { value: "THIS_MONTH",     label: "Este mes"          },
  { value: "LAST_MONTH",     label: "Mes anterior"      },
  { value: "THIS_YEAR",      label: "Este año"          },
  { value: "CUSTOM",         label: "Personalizado…"    },
];

// ── Main component ─────────────────────────────────────────────────────
export default function GoogleAdsDashboard() {
  const { user, loading: authLoading, role: authRole } = useAuth();
  const { branding, brandName } = useBranding();

  const [pageLoading, setPageLoading] = useState(true);
  const [sitio, setSitio] = useState<SitioData | null>(null);
  const [sitioId, setSitioId] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState("");

  // ── Hook ──────────────────────────────────────────────────────────
  const {
    customerId, setCustomerId, accountInfo, currency, isConnected,
    dateRange, setDateRange, customStart, customEnd, setCustomRange,
    campaigns, setCampaigns, reportRows, keywords, keywordPerf, searchTerms,
    totals, campaignPerf, chartData, campaignChart,
    loading, error, setError,
    loadData, loadKeywords, loadKeywordPerf, loadSearchTerms, apiPost, fetchForExport,
  } = useGoogleAdsData();

  const [tab, setTab] = useState<Tab>("resumen");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // ── Cambiar cuenta / Desconectar Google Ads ───────────────────────
  const handleAccountSwitched = useCallback((newId?: string) => {
    if (newId) setCustomerId(newId);
    loadData();
  }, [setCustomerId, loadData]);

  const handleDisconnect = useCallback(async () => {
    if (!user) return;
    if (typeof window !== "undefined" &&
        !window.confirm("¿Desconectar esta cuenta de Google Ads? Tendrás que volver a autorizar para reconectar.")) return;
    setDisconnecting(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action: "disconnect_google_ads" }),
      });
      if (!res.ok) throw new Error("No se pudo desconectar.");
      setCustomerId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al desconectar.");
    } finally {
      setDisconnecting(false);
    }
  }, [user, setCustomerId, setError]);

  const isActive = sitio?.statusPago === "activo" || authRole === "superadmin";

  // ── Load user + sitio ────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !user || !db) return;
    const _db = db;
    (async () => {
      try {
        const [profileSnap] = await Promise.all([
          getDoc(doc(_db, "usuarios", user.uid)),
        ]);

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

  // ── Keywords tab effect ──────────────────────────────────────────
  useEffect(() => {
    if (tab === "keywords" && isConnected) { loadKeywords(); loadKeywordPerf(); }
  }, [tab, isConnected, loadKeywords, loadKeywordPerf, dateRange, customStart, customEnd]);

  // ── Términos tab effect ──────────────────────────────────────────
  useEffect(() => {
    if (tab === "terminos" && isConnected) loadSearchTerms();
  }, [tab, isConnected, loadSearchTerms, dateRange, customStart, customEnd]);

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
  }, [apiPost, setCampaigns, setError]);

  // ── Paywall guard ─────────────────────────────────────────────────
  const requireActive = (feature: string, action: () => void) => {
    if (!isActive) { setPaywallFeature(feature); setShowPaywall(true); return; }
    action();
  };

  // ── Keyword perf map ─────────────────────────────────────────────
  const kwPerfById = new Map(keywordPerf.map((k) => [k.keywordId, k]));

  // ── Export handlers ──────────────────────────────────────────────
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
        brandName,
        logoUrl: branding.logoUrl || undefined,
        colorHex: branding.colorPrincipal || "#002366",
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
                  <GoogleAdsConnect onConnected={() => { /* blocked by paywall */ }} />
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
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 focus:outline-none"
            >
              {DATE_RANGES.map((r) => (
                <option key={r.value} value={r.value} className="bg-[#0f0f17]">{r.label}</option>
              ))}
            </select>
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
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Actualizar
            </button>
            <button
              onClick={handleExportCsv}
              disabled={!reportRows.length}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 disabled:opacity-40"
            >
              <Download size={13} /> CSV
            </button>
            <button
              onClick={handleExportPdf}
              disabled={!reportRows.length || pdfLoading}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 disabled:opacity-40"
            >
              {pdfLoading ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} Informe PDF
            </button>
            <a
              href={`https://ads.google.com/aw/overview?ocid=${customerId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
            >
              <ExternalLink size={13} /> Google Ads
            </a>
            <GoogleAdsConnect
              mode="switch"
              triggerLabel="Cambiar cuenta"
              triggerClassName="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 disabled:opacity-50"
              onConnected={handleAccountSwitched}
            />
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs text-red-300/80 hover:bg-red-500/10 disabled:opacity-50"
            >
              {disconnecting ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />} Desconectar
            </button>
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
          {(["resumen", "campanas", "keywords", "anuncios", "terminos"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-xl py-2 text-xs font-semibold capitalize transition-all ${
                tab === t ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              {t === "campanas" ? "Campañas" : t === "keywords" ? "Palabras clave" : t === "anuncios" ? "Anuncios" : t === "terminos" ? "Términos" : "Resumen"}
            </button>
          ))}
        </div>

        {/* ── Resumen ── */}
        {tab === "resumen" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* KPI Cards */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "Gasto", value: fmtMoney(totals.spend, currency), icon: DollarSign, color: "text-emerald-400" },
                { label: "Clics", value: fmtNum(totals.clicks), icon: MousePointerClick, color: "text-[#4285F4]" },
                { label: "Impresiones", value: fmtNum(totals.impressions), icon: Eye, color: "text-purple-400" },
                { label: "CTR", value: `${totals.ctr.toFixed(2)}%`, icon: TrendingUp, color: "text-amber-400" },
                { label: "CPC prom.", value: fmtMoney(totals.cpc, currency), icon: BarChart3, color: "text-pink-400" },
                { label: "Conversiones", value: fmtNum(totals.conversions), icon: Check, color: "text-cyan-400" },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <kpi.icon size={16} className={`mb-2 ${kpi.color}`} />
                  <p className="text-[11px] text-white/40">{kpi.label}</p>
                  <p className="text-lg font-bold text-white">{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Chart: Gasto + Conversiones dual-axis */}
            {chartData.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="mb-4 text-sm font-semibold text-white/70">Gasto y conversiones</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <Tooltip
                      contentStyle={{ background: "#0f0f17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                      labelStyle={{ color: "rgba(255,255,255,0.6)" }}
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
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Campaña</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Tipo</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Clics</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Impr.</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">CTR</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Conv.</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">CPA</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Presup./día</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Estado</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {campaigns.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-sm text-white/30">
                        {loading ? "Cargando campañas…" : "No hay campañas activas."}
                      </td>
                    </tr>
                  )}
                  {campaigns.map((c) => {
                    const s = campaignStatusLabel(c.status);
                    const isLoading = actionLoading === c.campaignId;
                    const p = campaignPerf.get(c.campaignId);
                    return (
                      <tr key={c.campaignId} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium text-white">{c.campaignName}</td>
                        <td className="px-4 py-3 text-xs text-white/50">{c.channelType}</td>
                        <td className="px-4 py-3 text-right text-white/70">{p ? fmtNum(p.clicks) : "—"}</td>
                        <td className="px-4 py-3 text-right text-white/70">{p ? fmtNum(p.impressions) : "—"}</td>
                        <td className="px-4 py-3 text-right text-white/70">{p ? `${p.ctr.toFixed(2)}%` : "—"}</td>
                        <td className="px-4 py-3 text-right text-white/70">{p ? fmtNum(p.conversions) : "—"}</td>
                        <td className="px-4 py-3 text-right text-white/70">{p && p.conversions > 0 ? fmtMoney(p.cpa, currency) : "—"}</td>
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
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Keyword</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Tipo de concordancia</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-white/40">Quality Score</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Gasto</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Clics</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">Conv.</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-white/40">CPA</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/40">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {keywords.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-white/30">
                        {loading ? "Cargando keywords…" : "No hay keywords."}
                      </td>
                    </tr>
                  )}
                  {keywords.map((kw) => {
                    const p = kwPerfById.get(kw.keywordId);
                    return (
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
                        <td className="px-4 py-3 text-right text-white/70">{p ? fmtMoney(p.cost, currency) : "—"}</td>
                        <td className="px-4 py-3 text-right text-white/70">{p ? fmtNum(p.clicks) : "—"}</td>
                        <td className="px-4 py-3 text-right text-white/70">{p ? fmtNum(p.conversions) : "—"}</td>
                        <td className="px-4 py-3 text-right text-white/70">{p && p.conversions > 0 ? fmtMoney(p.costPerConversion, currency) : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            kw.status === "ENABLED" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
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

        {/* ── Términos de búsqueda ── */}
        {tab === "terminos" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="mb-3 flex justify-end">
              <button
                onClick={() => downloadCSV(
                  `terminos-${dateRange.toLowerCase()}.csv`,
                  ["Término", "Campaña", "Gasto", "Clics", "Impresiones", "CTR", "Conversiones", "CPA"],
                  searchTerms.map((s) => [
                    s.term, s.campaignName, s.cost, s.clicks, s.impressions,
                    Number(s.ctr.toFixed(2)), s.conversions,
                    s.conversions > 0 ? Number(s.costPerConversion.toFixed(2)) : 0,
                  ]),
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
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-white/30">
                        {loading ? "Cargando términos…" : "Sin términos de búsqueda."}
                      </td>
                    </tr>
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
