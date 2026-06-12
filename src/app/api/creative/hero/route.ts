/**
 * Estudio Creativo — paso 2: imagen hero.
 *
 * POST { jobId } → genera la imagen hero 9:16 con nano-banana. Si el proyecto
 * ya tiene personaje de marca (brandCharacterPath), usa nano-banana/edit con
 * esa referencia para conservar la MISMA persona en todos los anuncios del
 * proyecto; si no lo tiene, el hero generado se convierte en el personaje.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verifyAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { generateHeroImage } from "@/lib/falClient";
import { saveBuffer, signedUrl, fetchToBuffer } from "@/lib/creativeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const h = request.headers.get("authorization") || "";
    const idToken = h.startsWith("Bearer ") ? h.slice(7) : null;
    const user = idToken ? await verifyAdmin(idToken) : null;
    if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const { jobId } = (await request.json()) as { jobId?: string };
    if (!jobId) return NextResponse.json({ error: "jobId requerido." }, { status: 400 });

    const db = getAdminDb();
    const jobRef = db.collection("creative_jobs").doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) return NextResponse.json({ error: "Job no encontrado." }, { status: 404 });
    const job = jobSnap.data()!;

    // Idempotencia: si ya hay hero, devolverlo (reintento del cliente)
    if (job.heroPath) {
      return NextResponse.json({ success: true, heroUrl: job.heroUrl });
    }

    const projRef = db.collection("creative_projects").doc(String(job.projectId));
    const projSnap = await projRef.get();
    const project = projSnap.data() || {};

    // Personaje de marca: referencia con signed URL fresca (fal la descarga)
    let referenceUrl: string | undefined;
    if (typeof project.brandCharacterPath === "string" && project.brandCharacterPath) {
      referenceUrl = await signedUrl(project.brandCharacterPath, 1);
    }

    const heroPrompt = String(job.script?.heroPrompt || "");
    if (!heroPrompt) return NextResponse.json({ error: "El job no tiene guion." }, { status: 409 });

    const img = await generateHeroImage(heroPrompt, referenceUrl);
    const buf = await fetchToBuffer(img.url);

    // saveBuffer devuelve la URL pública (CDN de fal) — se guarda como path y url
    const heroUrl = await saveBuffer(`hero_${jobId}.jpg`, buf, "image/jpeg");
    const heroPath = heroUrl;

    await jobRef.update({
      heroPath,
      heroUrl,
      status: "hero_ready",
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Primer hero del proyecto → queda como personaje de marca
    if (!project.brandCharacterPath) {
      await projRef.set({ brandCharacterPath: heroPath }, { merge: true });
    }

    return NextResponse.json({ success: true, heroUrl });
  } catch (err) {
    console.error("[creative/hero]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error generando hero." },
      { status: 500 }
    );
  }
}
