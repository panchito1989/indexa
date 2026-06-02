/**
 * Google Ads OAuth callback.
 *
 * Flow:
 *   1. Google redirige aquí con code + state después de que el usuario autoriza.
 *   2. Verificamos el state HMAC para recuperar el UID.
 *   3. Intercambiamos code → { access_token, refresh_token }.
 *   4. Guardamos ambos tokens (encriptados) en Firestore.
 *   5. Renderizamos HTML que postMessage("google-ads-oauth-success") y se cierra.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyState } from "@/lib/oauthState";
import { encryptToken } from "@/lib/tokenCrypto";
import { getAdminDb } from "@/lib/firebaseAdmin";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function popupHtml(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const isSuccess = payload.type === "google-ads-oauth-success";
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Google Ads — ${isSuccess ? "Conectado" : "Error"}</title>
<style>
  body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;
       font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
       background:#0a0a0f;color:#fff;text-align:center;padding:24px}
  .ok{color:#10b981}.err{color:#ef4444}
  h1{font-size:18px;margin:0 0 6px}p{font-size:13px;color:#94a3b8;margin:0}
</style></head>
<body>
  <div>
    <h1 class="${isSuccess ? "ok" : "err"}">
      ${isSuccess ? "✓ Google Ads conectado" : "Error al conectar"}
    </h1>
    <p>${isSuccess ? "Esta ventana se cerrará automáticamente…" : String(payload.error || "Cierra esta ventana e intenta de nuevo.")}</p>
  </div>
  <script>
    (function(){
      try {
        if (window.opener) {
          window.opener.postMessage(${json}, window.location.origin);
        }
      } catch(e) {}
      setTimeout(function(){ try { window.close(); } catch(e){} }, 600);
    })();
  </script>
</body></html>`;
}

function htmlResponse(payload: Record<string, unknown>, status = 200) {
  return new NextResponse(popupHtml(payload), {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // User denied access
  if (error) {
    return htmlResponse({ type: "google-ads-oauth-error", error: error });
  }

  if (!code || !state) {
    return htmlResponse({ type: "google-ads-oauth-error", error: "Faltan parámetros." }, 400);
  }

  const verified = verifyState(state, "google-ads");
  if (!verified) {
    return htmlResponse({ type: "google-ads-oauth-error", error: "State inválido o expirado." }, 400);
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `${url.protocol}//${url.host}`;
  const redirectUri = `${siteUrl}/api/auth/google-ads/callback`;

  if (!clientId || !clientSecret) {
    return htmlResponse(
      { type: "google-ads-oauth-error", error: "Google Ads no está configurado en el servidor." },
      503
    );
  }

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenData.access_token) {
      return htmlResponse({
        type: "google-ads-oauth-error",
        error: tokenData.error_description || tokenData.error || "Falló el intercambio de código.",
      });
    }

    if (!tokenData.refresh_token) {
      return htmlResponse({
        type: "google-ads-oauth-error",
        error: "Google no entregó refresh_token. Revoca el acceso en myaccount.google.com/permissions y vuelve a conectar.",
      });
    }

    const expiresAt = Date.now() + (tokenData.expires_in ?? 3600) * 1000;

    await getAdminDb()
      .collection("usuarios")
      .doc(verified.uid)
      .set(
        {
          googleAdsRefreshToken: encryptToken(tokenData.refresh_token),
          googleAdsAccessToken: encryptToken(tokenData.access_token),
          googleAdsTokenExpiresAt: expiresAt,
          googleAdsConnectedAt: Date.now(),
        },
        { merge: true }
      );

    return htmlResponse({ type: "google-ads-oauth-success" });
  } catch (err) {
    console.error("[google-ads/callback] error:", err instanceof Error ? err.message : err);
    return htmlResponse({
      type: "google-ads-oauth-error",
      error: "Error de conexión con Google.",
    });
  }
}
