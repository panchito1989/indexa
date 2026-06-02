/**
 * Genera el `state` firmado para el OAuth popup de Google Ads.
 * Idéntico al patrón de /api/auth/meta/state.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verifyAuth";
import { signState } from "@/lib/oauthState";
import { createRateLimiter } from "@/lib/rateLimit";

const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!limiter.check(ip)) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const user = await verifyIdToken(idToken);
  if (!user) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID no configurado." },
      { status: 503 }
    );
  }

  const state = signState(user.uid, "google-ads");
  return NextResponse.json({ state, clientId });
}
