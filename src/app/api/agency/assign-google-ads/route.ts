/**
 * Agency assigns (or unassigns) a Google Ads sub-account to one of its clients.
 *
 * The agency owns ONE MCC (connected once, token on the agency owner's usuarios doc).
 * Clients don't connect Google: the agency assigns them an existing sub-account id
 * under its MCC. The client's requests then resolve to the owner's token via
 * getValidAccessToken (see lib/googleAdsClient.ts).
 *
 * Auth: role "agency". Anti-IDOR: the target client must belong to the caller's agency.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAgency } from "@/lib/verifyAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { createRateLimiter } from "@/lib/rateLimit";
import { getValidAccessToken, getAccessibleCustomers } from "@/lib/googleAdsClient";

export const maxDuration = 30;

const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });

function extractToken(req: NextRequest): string | null {
  const h = req.headers.get("Authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!limiter.check(ip)) {
    return NextResponse.json({ success: false, message: "Demasiadas solicitudes." }, { status: 429 });
  }

  const token = extractToken(request);
  if (!token) {
    return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
  }
  const agencyUser = await verifyAgency(token);
  if (!agencyUser) {
    return NextResponse.json({ success: false, message: "Solo agencias pueden gestionar clientes." }, { status: 403 });
  }

  let body: { action?: string; clientUid?: string; customerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Body inválido." }, { status: 400 });
  }

  const action = body.action || "assign";
  const clientUid = (body.clientUid || "").trim();
  if (!clientUid) {
    return NextResponse.json({ success: false, message: "clientUid requerido." }, { status: 400 });
  }

  try {
    const db = getAdminDb();

    // Resolve the caller's agency (the caller IS the agency owner).
    const agencyQuery = await db.collection("agencias").where("uid", "==", agencyUser.uid).limit(1).get();
    if (agencyQuery.empty) {
      return NextResponse.json({ success: false, message: "No se encontró la agencia del usuario." }, { status: 404 });
    }
    const callerAgencyId = agencyQuery.docs[0].id;

    // Anti-IDOR: the target client must belong to the caller's agency.
    const clientSnap = await db.collection("usuarios").doc(clientUid).get();
    if (!clientSnap.exists) {
      return NextResponse.json({ success: false, message: "Cliente no encontrado." }, { status: 404 });
    }
    if (clientSnap.data()?.agencyId !== callerAgencyId) {
      return NextResponse.json({ success: false, message: "Este cliente no pertenece a tu agencia." }, { status: 403 });
    }

    // ── Unassign ──────────────────────────────────────────────────────
    if (action === "unassign") {
      await db.collection("usuarios").doc(clientUid).update({
        googleAdsCustomerId: "",
        googleAdsManagedByAgency: false,
      });
      return NextResponse.json({ success: true, message: "Cuenta de Google Ads desvinculada." });
    }

    // ── Assign ────────────────────────────────────────────────────────
    const customerId = (body.customerId || "").replace(/\D/g, "");
    if (!customerId) {
      return NextResponse.json({ success: false, message: "Customer ID inválido." }, { status: 400 });
    }

    // Validate the sub-account actually belongs to the agency's MCC.
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(agencyUser.uid);
    } catch {
      return NextResponse.json(
        { success: false, message: "Conecta Google Ads (MCC) antes de asignar cuentas." },
        { status: 400 }
      );
    }
    const customers = await getAccessibleCustomers(accessToken);
    if (!customers.some((c) => c.id === customerId)) {
      return NextResponse.json({ success: false, message: "Esa cuenta no pertenece a tu MCC." }, { status: 400 });
    }

    await db.collection("usuarios").doc(clientUid).update({
      googleAdsCustomerId: customerId,
      googleAdsManagedByAgency: true,
    });
    return NextResponse.json({ success: true, message: "Cuenta de Google Ads asignada." });
  } catch (err) {
    console.error("[assign-google-ads]", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ success: false, message: "Error interno." }, { status: 500 });
  }
}
