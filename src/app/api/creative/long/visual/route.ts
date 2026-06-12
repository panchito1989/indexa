/**
 * Modo largo — paso 3: visuales por segmento.
 *
 * POST { jobId } →
 *   - segmentos "image": nano-banana (con las referencias del proyecto) en
 *     batch con presupuesto de tiempo.
 *   - segmentos "veo": imagen base nano-banana → Veo image-to-video SIN audio
 *     (la narración va encima). Submit/poll idempotente con falRequestId —
 *     un reintento/timeout REANUDA el poll, nunca paga doble (patrón v1).
 *
 * Devuelve { state: "pending"|"done", visualDone } — el panel re-llama.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verifyAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { generateHeroImage, submitVeoScene, pollVeo } from "@/lib/falClient";
import { buildLongVeoPrompt } from "@/lib/creativeScript";
import { saveBuffer, fetchToBuffer } from "@/lib/creativeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUDGET_MS = 230_000;
const POLL_EVERY_MS = 10_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Seg {
  kind: "veo" | "image";
  narration: string;
  visualPrompt: string;
  imageUrl?: string;
  videoUrl?: string;
  falRequestId?: string;
  [k: string]: unknown;
}

function visualReady(s: Seg): boolean {
  return s.kind === "image" ? !!s.imageUrl : !!s.videoUrl;
}

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
    if (job.kind !== "long") return NextResponse.json({ error: "El job no es de modo largo." }, { status: 400 });

    const aspect = job.aspect === "16:9" ? ("16:9" as const) : ("9:16" as const);
    const segments = [...(job.segments as Seg[])];

    // Referencias del proyecto (producto/personaje) para TODAS las imágenes
    const projSnap = await db.collection("creative_projects").doc(String(job.projectId)).get();
    const project = projSnap.data() || {};
    const refs: string[] = Array.isArray(project.referenceUrls)
      ? (project.referenceUrls as unknown[]).filter((u): u is string => typeof u === "string" && !!u)
      : [];

    const deadline = Date.now() + BUDGET_MS;
    const countDone = () => segments.filter(visualReady).length;

    const persist = async () => {
      await jobRef.update({
        segments,
        visualDone: countDone(),
        status: "generating",
        updatedAt: FieldValue.serverTimestamp(),
      });
    };

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (visualReady(seg)) continue;
      if (Date.now() > deadline) return NextResponse.json({ state: "pending", visualDone: countDone() });

      // 1) Imagen del segmento (base para "veo", final para "image")
      if (!seg.imageUrl) {
        const img = await generateHeroImage(seg.visualPrompt, refs, aspect);
        const buf = await fetchToBuffer(img.url);
        seg.imageUrl = await saveBuffer(`long_${jobId}_img_${i}.jpg`, buf, "image/jpeg");
        segments[i] = seg;
        await persist();
      }
      if (seg.kind === "image") continue;

      // 2) Veo del segmento clave (sin audio — narración TTS encima)
      if (!seg.falRequestId) {
        const { requestId } = await submitVeoScene({
          prompt: buildLongVeoPrompt(seg),
          imageUrl: seg.imageUrl!,
          aspectRatio: aspect,
          generateAudio: false,
        });
        seg.falRequestId = requestId;
        segments[i] = seg;
        await persist();
      }

      // 3) Poll con presupuesto restante
      while (Date.now() < deadline) {
        const r = await pollVeo(seg.falRequestId!);
        if (r.state === "failed") {
          // Limpia para re-encolar en el siguiente intento
          delete seg.falRequestId;
          segments[i] = seg;
          await persist();
          return NextResponse.json(
            { error: `Visual del segmento ${i + 1} falló: ${r.error}` },
            { status: 502 }
          );
        }
        if (r.state === "done") {
          const buf = await fetchToBuffer(r.videoUrl);
          seg.videoUrl = await saveBuffer(`long_${jobId}_veo_${i}.mp4`, buf, "video/mp4");
          segments[i] = seg;
          await persist();
          break;
        }
        await sleep(POLL_EVERY_MS);
      }
      if (!seg.videoUrl) return NextResponse.json({ state: "pending", visualDone: countDone() });
    }

    return NextResponse.json({ state: "done", visualDone: countDone() });
  } catch (err) {
    console.error("[creative/long/visual]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error generando visuales." },
      { status: 500 }
    );
  }
}
