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
import {
  generateHeroImage, generateFluxImage, submitVeoScene, submitEconomyScene,
  pollVeo, ContentPolicyError, ECON_VIDEO_ROOT,
} from "@/lib/falClient";
import { generateGeminiImage, geminiKeyAvailable } from "@/lib/geminiImage";
import { buildLongVeoPrompt, sanitizeVisualPrompt } from "@/lib/creativeScript";
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
  let jobRefOuter: FirebaseFirestore.DocumentReference | null = null;
  try {
    const h = request.headers.get("authorization") || "";
    const idToken = h.startsWith("Bearer ") ? h.slice(7) : null;
    const user = idToken ? await verifyAdmin(idToken) : null;
    if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const { jobId } = (await request.json()) as { jobId?: string };
    if (!jobId) return NextResponse.json({ error: "jobId requerido." }, { status: 400 });

    const db = getAdminDb();
    const jobRef = db.collection("creative_jobs").doc(jobId);
    jobRefOuter = jobRef;
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) return NextResponse.json({ error: "Job no encontrado." }, { status: 404 });
    const job = jobSnap.data()!;
    if (job.kind !== "long") return NextResponse.json({ error: "El job no es de modo largo." }, { status: 400 });

    // Reanudación: limpia el error del intento anterior
    if (job.error) await jobRef.update({ error: FieldValue.delete() });

    const aspect = job.aspect === "16:9" ? ("16:9" as const) : ("9:16" as const);
    const quality = job.quality === "premium" ? "premium" : job.quality === "images" ? "images" : "economy";
    const segments = [...(job.segments as Seg[])];

    // Referencias del proyecto (producto/personaje) para TODAS las imágenes
    const projSnap = await db.collection("creative_projects").doc(String(job.projectId)).get();
    const project = projSnap.data() || {};
    const refs: string[] = Array.isArray(project.referenceUrls)
      ? (project.referenceUrls as unknown[]).filter((u): u is string => typeof u === "string" && !!u)
      : [];
    // Imagen → SIEMPRE devolvemos un Buffer (lo guarda el caller). Prioridad:
    //  - con referencias: nano-banana/edit (fal) — FLUX/Gemini-text no las usan.
    //  - sin refs y NO premium: Gemini (GRATIS, capa 500/día) si hay key, si no
    //    FLUX schnell (fal, $0.003).
    //  - premium: nano-banana (fal).
    const freeImages = refs.length === 0 && quality !== "premium" && geminiKeyAvailable();
    const makeImageBuffer = async (prompt: string): Promise<{ buffer: Buffer; contentType: string }> => {
      if (freeImages) {
        const g = await generateGeminiImage(prompt, aspect);
        return { buffer: g.buffer, contentType: g.contentType };
      }
      const img = refs.length === 0 && quality !== "premium"
        ? await generateFluxImage(prompt, aspect)
        : await generateHeroImage(prompt, refs, aspect);
      return { buffer: await fetchToBuffer(img.url), contentType: "image/jpeg" };
    };
    // Clip: Veo (premium) o Wan económico. Root del queue para el poll.
    const submitClip = (prompt: string, imageUrl: string) =>
      quality === "premium"
        ? submitVeoScene({ prompt, imageUrl, aspectRatio: aspect, generateAudio: false })
        : submitEconomyScene({ prompt, imageUrl });
    const clipRoot = quality === "premium" ? "fal-ai/veo3" : ECON_VIDEO_ROOT;

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
        let out;
        try {
          out = await makeImageBuffer(seg.visualPrompt);
        } catch (e) {
          if (!(e instanceof ContentPolicyError)) throw e;
          // 2º intento automático: prompt saneado (sin menores humanos /
          // marcas / personas reales — estilo caricatura familiar).
          try {
            out = await makeImageBuffer(sanitizeVisualPrompt(seg.visualPrompt));
          } catch (e2) {
            if (!(e2 instanceof ContentPolicyError)) throw e2;
            const m = `Segmento ${i + 1}: el generador rechazó el visual por políticas de contenido (ni saneado pasó). Edítalo con el lápiz — evita niños humanos, marcas o personas reales — y dale Continuar.`;
            await jobRef.update({ error: m.slice(0, 300) }).catch(() => {});
            return NextResponse.json({ error: m }, { status: 422 });
          }
        }
        const ext = out.contentType.includes("png") ? "png" : "jpg";
        seg.imageUrl = await saveBuffer(`long_${jobId}_img_${i}.${ext}`, out.buffer, out.contentType);
        segments[i] = seg;
        await persist();
      }
      if (seg.kind === "image") continue;

      // 2) Clip del segmento clave (sin audio — narración TTS encima).
      // Veo (premium) o Wan económico según el modo del job.
      if (!seg.falRequestId) {
        try {
          const { requestId } = await submitClip(buildLongVeoPrompt(seg), seg.imageUrl!);
          seg.falRequestId = requestId;
        } catch (e) {
          if (!(e instanceof ContentPolicyError)) throw e;
          try {
            // 2º intento: prompt de movimiento saneado
            const { requestId } = await submitClip(sanitizeVisualPrompt(buildLongVeoPrompt(seg)), seg.imageUrl!);
            seg.falRequestId = requestId;
          } catch (e2) {
            if (!(e2 instanceof ContentPolicyError)) throw e2;
            // El generador de video no lo acepta ni saneado → DEGRADAR a
            // imagen: la imagen base YA pasó el filtro, así que el segmento
            // sale como imagen animada (Ken Burns) y el video no se atora.
            seg.kind = "image";
            seg.degraded = "policy";
            segments[i] = seg;
            await persist();
            continue;
          }
        }
        segments[i] = seg;
        await persist();
      }

      // 3) Poll con presupuesto restante (mismo modelo con que se encoló)
      while (Date.now() < deadline) {
        const r = await pollVeo(seg.falRequestId!, clipRoot);
        if (r.state === "failed") {
          delete seg.falRequestId;
          // Si Veo lo rechazó por políticas, reintentar es inútil → degradar
          // a imagen animada (la base ya pasó el filtro) y seguir.
          if (/policy|polít|flagged|content checker/i.test(String(r.error || ""))) {
            seg.kind = "image";
            seg.degraded = "policy";
            segments[i] = seg;
            await persist();
            break;
          }
          // Fallo transitorio: limpia para re-encolar en el siguiente intento
          segments[i] = seg;
          await persist();
          // Persistir también en el job — la tarjeta debe decir QUÉ falló
          const failMsg = `Visual del segmento ${i + 1} falló: ${r.error}`;
          await jobRef.update({ error: failMsg.slice(0, 300) }).catch(() => {});
          return NextResponse.json({ error: failMsg }, { status: 502 });
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
      if (!visualReady(seg)) return NextResponse.json({ state: "pending", visualDone: countDone() });
    }

    return NextResponse.json({ state: "done", visualDone: countDone() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error generando visuales.";
    console.error("[creative/long/visual]", msg);
    // Persistir el error en el job para que la tarjeta muestre QUÉ falló
    if (jobRefOuter) await jobRefOuter.update({ error: `Visuales: ${msg}`.slice(0, 300) }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
