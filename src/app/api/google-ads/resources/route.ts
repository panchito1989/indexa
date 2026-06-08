/**
 * Lista los Customer IDs accesibles desde el MCC configurado.
 * Lee el token de Firestore (nunca del cliente).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verifyAuth";
import { getValidAccessToken, getAccessibleCustomers, diagnoseAccess } from "@/lib/googleAdsClient";
import { createRateLimiter } from "@/lib/rateLimit";

export const maxDuration = 30;

const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!limiter.check(ip)) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const user = await verifyIdToken(idToken);
  if (!user) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

  try {
    const accessToken = await getValidAccessToken(user.uid);
    try {
      const customers = await getAccessibleCustomers(accessToken);
      return NextResponse.json({ customers });
    } catch (inner) {
      // Falló listar cuentas (típico: GOOGLE_ADS_LOGIN_CUSTOMER_ID mal configurado, o
      // la cuenta no está bajo ese MCC). Corre un diagnóstico que revela qué cuentas ve
      // el Google conectado y cuál es la manager (MCC), y lo anexa al error visible.
      let diag = "";
      try {
        const d = await diagnoseAccess(accessToken);
        const list = d.accounts.map((a) =>
          `${a.id}${a.isManager === true ? " = MANAGER/MCC" : a.isManager === false ? " = cliente" : ""}${a.name ? ` "${a.name}"` : ""}${a.note ? ` (${a.note})` : ""}`
        ).join("  ·  ");
        diag = `\n\n🔎 DIAGNÓSTICO:\n• GOOGLE_ADS_LOGIN_CUSTOMER_ID actual = ${d.envLoginCustomerId}\n• Cuentas que ve tu Google conectado: ${list || "(ninguna)"}\n→ En GOOGLE_ADS_LOGIN_CUSTOMER_ID va el id marcado MANAGER/MCC; para ver campañas conecta una marcada 'cliente'. Si NO aparece ninguna MANAGER, tu Google no administra un MCC.`;
      } catch { /* diagnóstico best-effort */ }
      throw new Error((inner instanceof Error ? inner.message : "Error") + diag);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido.";
    console.error("[google-ads/resources]", msg);
    const status = msg.includes("No hay cuenta") ? 404 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
