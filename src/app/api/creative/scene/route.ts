/**
 * Estudio Creativo — paso 3: generar UNA escena de video (Veo 3, 8s).
 *
 * POST { jobId, index } →
 *   - imagen de arranque: hero (escena 0) o last_frame de la escena anterior
 *     (así el personaje/lugar continúan sin saltos)
 *   - encola en fal y guarda falRequestId DE INMEDIATO → si esta llamada se
 *     corta por timeout, el reintento REANUDA el poll del mismo request
 *     (idempotente: nunca se paga una escena dos veces)
 *   - al completar: sube el mp4 a Storage y extrae el último fotograma con
 *     ffmpeg (será el arranque de la siguiente escena)
 *
 * Respuestas: { state: "done" | "pending" } — con "pending" el panel re-llama.
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, mkdir, rm } from "fs/promises";
import ffmpegPath from "ffmpeg-static";
import { verifyAdmin } from "@/lib/verifyAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { submitVeoScene, pollVeo } from "@/lib/falClient";
import { buildVeoPrompt, type CreativeScript } from "@/lib/creativeScript";
import { saveBuffer, signedUrl, fetchToBuffer } from "@/lib/creativeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);
// Presupuesto de poll dentro de la function (deja margen del maxDuration para
// descarga + ffmpeg + subida)
const POLL_BUDGET_MS = 210_000;
const POLL_EVERY_MS = 10_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function extractLastFrame(videoBuf: Buffer, workDir: string): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg-static no disponible en este entorno.");
  await mkdir(workDir, { recursive: true });
  const inPath = `${workDir}/in.mp4`;
  const outPath = `${workDir}/last.jpg`;
  await writeFile(inPath, videoBuf);
  await execFileAsync(ffmpegPath, [
    "-v", "error",
    "-sseof", "-0.15",
    "-i", inPath,
    "-frames:v", "1",
    "-q:v", "2",
    outPath,
    "-y",
  ]);
  return readFile(outPath);
}

export async function POST(request: NextRequest) {
  try {
    const h = request.headers.get("authorization") || "";
    const idToken = h.startsWith("Bearer ") ? h.slice(7) : null;
    const user = idToken ? await verifyAdmin(idToken) : null;
    if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const { jobId, index } = (await request.json()) as { jobId?: string; index?: number };
    const i = Number(index);
    if (!jobId || !Number.isInteger(i) || i < 0 || i > 3) {
      return NextResponse.json({ error: "jobId e index (0-3) requeridos." }, { status: 400 });
    }

    const db = getAdminDb();
    const jobRef = db.collection("creative_jobs").doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) return NextResponse.json({ error: "Job no encontrado." }, { status: 404 });
    const job = jobSnap.data()!;
    const script = job.script as CreativeScript | undefined;
    if (!script || !job.heroPath) {
      return NextResponse.json({ error: "El job aún no tiene guion/hero." }, { status: 409 });
    }
    if (i >= Number(job.numScenes)) {
      return NextResponse.json({ error: "index fuera de rango para este job." }, { status: 400 });
    }

    const scenes: Array<Record<string, unknown>> = Array.isArray(job.scenes) ? [...job.scenes] : [];

    // Idempotencia total: escena ya terminada
    if (scenes[i]?.videoPath) {
      return NextResponse.json({ state: "done", videoUrl: scenes[i].videoUrl });
    }

    // Escena previa debe estar lista (necesitamos su last frame)
    if (i > 0 && !scenes[i - 1]?.lastFramePath) {
      return NextResponse.json(
        { error: `La escena ${i - 1} debe completarse primero.` },
        { status: 409 }
      );
    }

    // ── Encolar (solo si no hay request pendiente de una llamada anterior) ──
    let falRequestId = scenes[i]?.falRequestId as string | undefined;
    if (!falRequestId) {
      const startPath = i === 0 ? String(job.heroPath) : String(scenes[i - 1].lastFramePath);
      const startUrl = await signedUrl(startPath, 1);
      const prompt = buildVeoPrompt(script.scenes[i], i);

      const { requestId } = await submitVeoScene({ prompt, imageUrl: startUrl });
      falRequestId = requestId;

      scenes[i] = { ...(scenes[i] || {}), falRequestId };
      await jobRef.update({
        scenes,
        status: "generating",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // ── Poll con presupuesto ──
    const deadline = Date.now() + POLL_BUDGET_MS;
    while (Date.now() < deadline) {
      const result = await pollVeo(falRequestId);

      if (result.state === "failed") {
        // Limpia el request fallido para que el reintento re-encole desde cero
        // (no usar FieldValue.delete() dentro de arrays — Firestore no lo permite)
        const cleaned = scenes.map((s, k) => (k === i ? {} : s));
        await jobRef.update({
          scenes: cleaned,
          error: `Escena ${i + 1}: ${result.error}`,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return NextResponse.json({ error: `Escena ${i + 1} falló: ${result.error}` }, { status: 502 });
      }

      if (result.state === "done") {
        const videoBuf = await fetchToBuffer(result.videoUrl);

        // saveBuffer devuelve la URL pública (CDN de fal)
        const videoUrl = await saveBuffer(`scene_${i}_${jobId}.mp4`, videoBuf, "video/mp4");
        const videoPath = videoUrl;

        // Último fotograma → arranque de la siguiente escena
        const workDir = `/tmp/creative-${jobId}-${i}`;
        let lastFramePath = "";
        try {
          const frameBuf = await extractLastFrame(videoBuf, workDir);
          lastFramePath = await saveBuffer(`scene_${i}_last_${jobId}.jpg`, frameBuf, "image/jpeg");
        } finally {
          await rm(workDir, { recursive: true, force: true }).catch(() => {});
        }

        scenes[i] = { falRequestId, videoPath, videoUrl, lastFramePath };
        const scenesDone = i + 1;
        await jobRef.update({
          scenes,
          scenesDone,
          status: scenesDone >= Number(job.numScenes) ? "scenes_ready" : "generating",
          error: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({ state: "done", videoUrl });
      }

      await sleep(POLL_EVERY_MS);
    }

    // Presupuesto agotado: el cliente re-llama y reanudamos el poll
    return NextResponse.json({ state: "pending" });
  } catch (err) {
    console.error("[creative/scene]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error generando escena." },
      { status: 500 }
    );
  }
}
