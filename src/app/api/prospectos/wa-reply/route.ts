import { NextRequest, NextResponse } from "next/server";
import { sendTextMessage, type PhoneCountry } from "@/lib/whatsapp";
import { verifyRole } from "@/lib/verifyAuth";
import { createRateLimiter } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

/**
 * POST /api/prospectos/wa-reply
 *
 * Respuesta rápida (texto libre) a un prospecto que escribió por WhatsApp.
 * Meta solo permite texto libre dentro de las 24h posteriores al último
 * mensaje ENTRANTE del prospecto — fuera de esa ventana devolvemos 409 para
 * que el operador use un template o el link wa.me desde su teléfono.
 *
 * Permitido para superadmin y subadmin (el rol de prospección fría).
 * Al responder, limpia wa_priority (sale de la bandeja prioritaria).
 */

const limiter = createRateLimiter({ windowMs: 60_000, max: 20 });

const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

interface ReplyBody {
  authToken: string;
  prospectoId: string;
  text: string;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!limiter.check(ip)) {
    return NextResponse.json(
      { success: false, message: "Demasiadas solicitudes." },
      { status: 429 }
    );
  }

  try {
    const body: ReplyBody = await request.json();
    const { authToken, prospectoId, text } = body;

    if (!authToken || !prospectoId || !text?.trim()) {
      return NextResponse.json(
        { success: false, message: "Faltan parámetros." },
        { status: 400 }
      );
    }
    if (text.length > 4000) {
      return NextResponse.json(
        { success: false, message: "Mensaje demasiado largo (máx 4000)." },
        { status: 400 }
      );
    }

    const tokenUser = await verifyRole(authToken, ["superadmin", "subadmin"]);
    if (!tokenUser) {
      return NextResponse.json(
        { success: false, message: "No autorizado." },
        { status: 403 }
      );
    }

    const db = getAdminDb();
    const ref = db.collection("prospectos_frios").doc(prospectoId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json(
        { success: false, message: "Prospecto no encontrado." },
        { status: 404 }
      );
    }
    const data = snap.data() || {};

    // Ventana de 24h de Meta: requiere mensaje entrante reciente.
    const lastInbound = data.wa_last_inbound_at as Timestamp | undefined;
    if (!lastInbound || Date.now() - lastInbound.toMillis() > WINDOW_24H_MS) {
      return NextResponse.json(
        {
          success: false,
          message:
            "La ventana de 24h está cerrada — el prospecto no ha escrito en las últimas 24 horas. Usa un template aprobado o escribe desde el WhatsApp del negocio.",
        },
        { status: 409 }
      );
    }

    // wa_id es el número exacto desde el que escribió (E.164 sin '+').
    const waId = typeof data.wa_id === "string" ? data.wa_id : "";
    const target = waId || (typeof data.telefono === "string" ? data.telefono : "");
    if (!target) {
      return NextResponse.json(
        { success: false, message: "El prospecto no tiene teléfono registrado." },
        { status: 400 }
      );
    }
    const country: PhoneCountry =
      data.wa_country === "MX" || data.wa_country === "US"
        ? data.wa_country
        : waId.startsWith("52")
          ? "MX"
          : "US";

    const r = await sendTextMessage(target, text.trim(), country);
    if (!r.success) {
      return NextResponse.json(
        { success: false, message: r.error || "Error enviando mensaje", errorCode: r.errorCode },
        { status: 502 }
      );
    }

    await ref.set(
      {
        wa_priority: false,
        wa_last_reply_text: text.trim(),
        wa_last_reply_at: FieldValue.serverTimestamp(),
        wa_last_reply_by: tokenUser.uid,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, messageId: r.messageId });
  } catch (err) {
    console.error("wa-reply error:", err);
    return NextResponse.json(
      { success: false, message: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
