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
