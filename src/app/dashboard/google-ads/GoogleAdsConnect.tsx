"use client";

/**
 * Google Ads OAuth connector — idéntico en estructura a MetaConnect.tsx.
 *
 * 1. POST /api/auth/google-ads/state → { state, clientId }
 * 2. Abre popup en accounts.google.com/o/oauth2/v2/auth
 * 3. Callback guarda tokens → postMessage("google-ads-oauth-success")
 * 4. Fetch /api/google-ads/resources → lista Customer IDs del MCC
 * 5. Usuario elige → POST /api/tokens { googleAdsCustomerId }
 * 6. onConnected() notifica al padre
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Check, AlertCircle, X, Building2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

interface GoogleCustomer {
  id: string;
  name: string;
  currencyCode: string;
  timeZone: string;
}

interface Props {
  onConnected: () => void;
  alreadyConnected?: boolean;
}

const SCOPES = "https://www.googleapis.com/auth/adwords";

export default function GoogleAdsConnect({ onConnected, alreadyConnected = false }: Props) {
  const { user } = useAuth();

  const [phase, setPhase] = useState<
    "idle" | "popup" | "fetching" | "selecting" | "saving" | "error"
  >("idle");
  const [error, setError] = useState("");
  const [customers, setCustomers] = useState<GoogleCustomer[]>([]);
  const [pickedCustomer, setPickedCustomer] = useState("");

  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const fetchResources = useCallback(async () => {
    if (!user) return;
    setPhase("fetching");
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/google-ads/resources", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar las cuentas.");
      setCustomers(data.customers ?? []);
      if (data.customers?.length === 1) setPickedCustomer(data.customers[0].id);
      setPhase("selecting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
      setPhase("error");
    }
  }, [user]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; error?: string } | null;
      if (!data?.type) return;
      if (data.type === "google-ads-oauth-success") {
        if (pollRef.current) clearInterval(pollRef.current);
        fetchResources();
      } else if (data.type === "google-ads-oauth-error") {
        if (pollRef.current) clearInterval(pollRef.current);
        setError(data.error || "Conexión cancelada.");
        setPhase("error");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [fetchResources]);

  const startOAuth = useCallback(async () => {
    if (!user) return;
    setError("");
    setPhase("popup");

    let stateData: { state: string; clientId: string };
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/auth/google-ads/state", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      stateData = await res.json();
      if (!res.ok) throw new Error((stateData as unknown as { error?: string }).error || "No se pudo iniciar.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar OAuth.");
      setPhase("error");
      return;
    }

    const redirectUri = `${window.location.origin}/api/auth/google-ads/callback`;
    const oauthUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      new URLSearchParams({
        client_id: stateData.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
        state: stateData.state,
      });

    const w = 600;
    const h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    popupRef.current = window.open(
      oauthUrl,
      "google-ads-oauth",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
    );

    if (!popupRef.current) {
      setError("Tu navegador bloqueó la ventana. Permite popups e intenta de nuevo.");
      setPhase("error");
      return;
    }

    pollRef.current = setInterval(() => {
      if (popupRef.current?.closed) {
        if (pollRef.current) clearInterval(pollRef.current);
        setPhase((p) => {
          if (p === "popup") {
            setError("Cancelaste la conexión.");
            return "error";
          }
          return p;
        });
      }
    }, 700);
  }, [user]);

  const saveSelection = useCallback(async () => {
    if (!user || !pickedCustomer) return;
    setPhase("saving");
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          action: "save",
          tokens: { googleAdsCustomerId: pickedCustomer },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || "No se pudo guardar.");
      }
      onConnected();
      setPhase("idle");
      setCustomers([]);
      setPickedCustomer("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
      setPhase("error");
    }
  }, [user, pickedCustomer, onConnected]);

  const closeSelector = () => {
    setPhase("idle");
    setCustomers([]);
    setPickedCustomer("");
  };

  return (
    <>
      <button
        onClick={startOAuth}
        disabled={phase === "popup" || phase === "fetching" || phase === "saving"}
        className="group relative inline-flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-[#4285F4] to-[#1a73e8] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-60"
      >
        {phase === "popup" || phase === "fetching" ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/>
          </svg>
        )}
        {phase === "popup"
          ? "Esperando autorización…"
          : phase === "fetching"
            ? "Cargando cuentas…"
            : alreadyConnected
              ? "Volver a conectar Google Ads"
              : "Conectar Google Ads"}
      </button>

      {error && phase === "error" && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setPhase("idle")} className="text-red-400 hover:text-red-200">
            <X size={14} />
          </button>
        </div>
      )}

      {(phase === "selecting" || phase === "saving") && customers.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f17] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4285F4]/15 text-[#4285F4]">
                  <Check size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">¡Google Ads conectado!</h3>
                  <p className="text-xs text-white/50">Elige la cuenta que deseas gestionar.</p>
                </div>
              </div>
              <button
                onClick={closeSelector}
                className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-6 py-5 space-y-2">
              {customers.map((c) => {
                const picked = pickedCustomer === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPickedCustomer(c.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                      picked
                        ? "border-[#4285F4] bg-[#4285F4]/10 ring-2 ring-[#4285F4]/30"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5">
                        <Building2 size={16} className="text-white/60" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{c.name}</p>
                        <p className="text-[11px] text-white/40">
                          ID: {c.id} · {c.currencyCode} · {c.timeZone}
                        </p>
                      </div>
                    </div>
                    {picked && <Check size={16} className="text-[#4285F4]" />}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
              <p className="text-[11px] text-white/40">Token guardado encriptado. Desconecta cuando quieras.</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={closeSelector}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white/60 hover:bg-white/5 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveSelection}
                  disabled={!pickedCustomer || phase === "saving"}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#4285F4] px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#3367d6] disabled:opacity-50"
                >
                  {phase === "saving" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Guardar y conectar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
