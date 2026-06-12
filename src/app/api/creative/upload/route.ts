/**
 * Estudio Creativo — subir imagen de referencia (producto/objeto/personaje).
 * POST { imageBase64, fileName } → CDN de fal → { url }.
 * El panel la guarda en creative_projects.referenceUrls (máx 5).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verifyAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { saveBuffer } from "@/lib/creativeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

export async function POST(request: NextRequest) {
  try {
    const h = request.headers.get("authorization") || "";
    const idToken = h.startsWith("Bearer ") ? h.slice(7) : null;
    const user = idToken ? await verifyAdmin(idToken) : null;
    if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    if (!(await checkRateLimit(`creative-upload:${user.uid}`, 30, 3600))) {
      return NextResponse.json({ error: "Límite de subidas por hora." }, { status: 429 });
    }

    const { imageBase64, fileName } = (await request.json()) as {
      imageBase64?: string;
      fileName?: string;
    };
    if (!imageBase64) return NextResponse.json({ error: "imageBase64 requerido." }, { status: 400 });

    // Acepta data URI o base64 pelón
    const m = imageBase64.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
    const contentType = m ? m[1] : "image/jpeg";
    const b64 = m ? m[2] : imageBase64;
    const buf = Buffer.from(b64, "base64");
    if (!buf.length || buf.length > MAX_BYTES) {
      return NextResponse.json({ error: "Imagen vacía o mayor a 8MB." }, { status: 400 });
    }

    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const url = await saveBuffer(`ref_${Date.now()}_${(fileName || "imagen").slice(0, 40)}.${ext}`, buf, contentType);
    return NextResponse.json({ success: true, url });
  } catch (err) {
    console.error("[creative/upload]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error subiendo la imagen." }, { status: 500 });
  }
}
