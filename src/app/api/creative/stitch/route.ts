/**
 * Estudio Creativo — paso 4: empalmar las escenas en el video final.
 *
 * POST { jobId } → descarga las N escenas de Storage a /tmp, las concatena
 * con ffmpeg (-f concat -c copy: mismo códec/resolución porque salen del
 * mismo modelo, sin re-encodear) y sube el final a Storage.
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, mkdir, rm } from "fs/promises";
import ffmpegPath from "ffmpeg-static";
import { verifyAdmin } from "@/lib/verifyAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { saveBuffer, signedUrl, downloadToBuffer } from "@/lib/creativeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  const workDir = `/tmp/creative-stitch-${Date.now()}`;
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

    // Idempotencia
    if (job.finalPath) {
      return NextResponse.json({ success: true, finalUrl: job.finalUrl });
    }

    const scenes = (Array.isArray(job.scenes) ? job.scenes : []) as Array<{ videoPath?: string }>;
    const n = Number(job.numScenes);
    if (scenes.filter((s) => s?.videoPath).length < n) {
      return NextResponse.json(
        { error: "Aún faltan escenas por generar." },
        { status: 409 }
      );
    }
    if (!ffmpegPath) throw new Error("ffmpeg-static no disponible en este entorno.");

    await mkdir(workDir, { recursive: true });

    // Con UNA sola escena no hay nada que empalmar
    let finalBuf: Buffer;
    if (n === 1) {
      finalBuf = await downloadToBuffer(String(scenes[0].videoPath));
    } else {
      const listLines: string[] = [];
      for (let i = 0; i < n; i++) {
        const local = `${workDir}/scene_${i}.mp4`;
        await writeFile(local, await downloadToBuffer(String(scenes[i].videoPath)));
        listLines.push(`file 'scene_${i}.mp4'`);
      }
      const listPath = `${workDir}/list.txt`;
      await writeFile(listPath, listLines.join("\n") + "\n");

      const outPath = `${workDir}/final.mp4`;
      await execFileAsync(
        ffmpegPath,
        ["-v", "error", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath, "-y"],
        { cwd: workDir }
      );
      finalBuf = await readFile(outPath);
    }

    // saveBuffer devuelve la URL pública (CDN de fal)
    const finalUrl = await saveBuffer(`final_${jobId}.mp4`, finalBuf, "video/mp4");
    const finalPath = finalUrl;

    await jobRef.update({
      finalPath,
      finalUrl,
      status: "done",
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, finalUrl });
  } catch (err) {
    console.error("[creative/stitch]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error empalmando el video." },
      { status: 500 }
    );
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
