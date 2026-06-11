import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { createRateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cancel-survey?sid={sitioId}&reason={precio|resultados|negocio|otro}
 *
 * Destino de los botones del email de encuesta de cancelación (1 clic).
 * Guarda la respuesta en cancel_surveys y muestra una mini página de gracias.
 * Sin auth (viene de un email), pero valida que el sitio exista y limita
 * por IP. Una respuesta por sitio: clics posteriores actualizan la razón.
 */

const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });

const VALID_REASONS = new Set(["precio", "resultados", "negocio", "otro"]);

const REASON_LABEL: Record<string, string> = {
  precio: "El precio",
  resultados: "No vi resultados",
  negocio: "Pausé o cerré el negocio",
  otro: "Otra cosa",
};

function thanksPage(reasonLabel: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Gracias — INDEXA</title>
</head>
<body style="margin:0; font-family:-apple-system,'Inter',Arial,sans-serif; background:#F1F5F9; display:flex; align-items:center; justify-content:center; min-height:100vh;">
  <div style="background:#fff; border-radius:16px; padding:40px 32px; max-width:420px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.08);">
    <div style="font-size:48px;">🙏</div>
    <h1 style="color:#002366; font-size:22px; margin:16px 0 8px;">Gracias por contarnos</h1>
    <p style="color:#475569; font-size:15px; line-height:1.6; margin:0;">
      Registramos tu respuesta: <strong>${reasonLabel}</strong>.<br/>
      Tu sitio queda guardado tal como lo dejaste — si algún día quieres volver,
      se reactiva el mismo día.
    </p>
    <a href="https://wa.me/525622042820" style="display:inline-block; margin-top:24px; background:#FF6600; color:#fff; padding:12px 28px; border-radius:10px; text-decoration:none; font-weight:700;">
      Hablar con nosotros
    </a>
  </div>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!limiter.check(ip)) {
    return new NextResponse("Demasiadas solicitudes.", { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const sid = searchParams.get("sid") || "";
  const reason = (searchParams.get("reason") || "").toLowerCase();

  if (!sid || !VALID_REASONS.has(reason)) {
    return new NextResponse("Solicitud inválida.", { status: 400 });
  }

  try {
    const db = getAdminDb();
    const sitioSnap = await db.collection("sitios").doc(sid).get();
    if (!sitioSnap.exists) {
      return new NextResponse("Sitio no encontrado.", { status: 404 });
    }
    const sitio = sitioSnap.data() || {};

    // Una respuesta por sitio: si ya respondió, actualizamos la razón.
    const existing = await db
      .collection("cancel_surveys")
      .where("sitioId", "==", sid)
      .limit(1)
      .get();

    if (!existing.empty) {
      await existing.docs[0].ref.set(
        { reason, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    } else {
      await db.collection("cancel_surveys").add({
        sitioId: sid,
        ownerId: typeof sitio.ownerId === "string" ? sitio.ownerId : null,
        nombre: typeof sitio.nombre === "string" ? sitio.nombre : "",
        reason,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return new NextResponse(thanksPage(REASON_LABEL[reason] || reason), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("cancel-survey error:", err instanceof Error ? err.message : err);
    return new NextResponse("Error interno.", { status: 500 });
  }
}
