/**
 * Derive the public origin (protocol + host) from an incoming request.
 *
 * Honors the `x-forwarded-host` / `x-forwarded-proto` headers set by proxies
 * (Vercel, ngrok, cloudflared) so the value matches the URL the browser is
 * actually using — which is exactly what `window.location.origin` returns on
 * the client.
 *
 * This keeps the OAuth `redirect_uri` consistent between the authorize step
 * (built client-side from `window.location.origin`) and the token-exchange step
 * (built here on the server). As a result the OAuth flows work identically on
 * localhost, HTTPS tunnels, Vercel previews and production — with no
 * per-environment configuration and without depending on NEXT_PUBLIC_SITE_URL.
 */
export function getRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") || url.host;
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(/:$/, "");
  return `${proto}://${host}`;
}
