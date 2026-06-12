/**
 * Modo largo — paso 5: empalme final.
 * POST { jobId } → concat -c copy de todos los segUrl (parámetros idénticos
 * por diseño del render) → finalUrl, status "done".
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, mkdir, rm } from "fs/promises";
import ffmpegPath from "ffmpeg-static";
import { verifyAdmin } from "@/lib/verifyAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { saveBuffer, fetchToBuffer } from "@/lib/creativeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  const workDir = `/tmp/long-stitch-${Date.now()}`;
  let jobRefOuter: FirebaseFirestore.DocumentReference | null = null;
  try {
    const h = request.headers.get("authorization") || "";
    const idToken = h.startsWith("Bearer ") ? h.slice(7) : null;
    const user = idToken ? await verifyAdmin(idToken) : null;
    if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const { jobId } = (await request.json()) as { jobId?: string };
    if (!jobId) return NextResponse.json({ error: "jobId requerido." }, { status: 400 });
    if (!ffmpegPath) throw new Error("ffmpeg-static no disponible.");

    const db = getAdminDb();
    const jobRef = db.collection("creative_jobs").doc(jobId);
    jobRefOuter = jobRef;
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) return NextResponse.json({ error: "Job no encontrado." }, { status: 404 });
    const job = jobSnap.data()!;
    if (job.kind !== "long") return NextResponse.json({ error: "El job no es de modo largo." }, { status: 400 });

    // Reanudación: limpia el error del intento anterior
    if (job.error) await jobRef.update({ error: FieldValue.delete() });

    if (job.finalPath) {
      return NextResponse.json({ success: true, finalUrl: job.finalUrl });
    }

    const segments = (job.segments as Array<{ segUrl?: string }>) || [];
    if (!segments.length || segments.some((s) => !s.segUrl)) {
      return NextResponse.json({ error: "Aún faltan segmentos por renderizar." }, { status: 409 });
    }

    await mkdir(workDir, { recursive: true });
    const listLines: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      const local = `seg_${i}.mp4`;
      await writeFile(`${workDir}/${local}`, await fetchToBuffer(String(segments[i].segUrl)));
      listLines.push(`file '${local}'`);
    }
    await writeFile(`${workDir}/list.txt`, listLines.join("\n") + "\n");

    await execFileAsync(
      ffmpegPath,
      ["-v", "error", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "final.mp4", "-y"],
      { cwd: workDir }
    );
    const finalBuf = await readFile(`${workDir}/final.mp4`);

    const finalUrl = await saveBuffer(`long_${jobId}_final.mp4`, finalBuf, "video/mp4");
    await jobRef.update({
      finalPath: finalUrl,
      finalUrl,
      status: "done",
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, finalUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error empalmando el video.";
    console.error("[creative/long/stitch]", msg);
    // Persistir el error en el job para que la tarjeta muestre QUÉ falló
    if (jobRefOuter) await jobRefOuter.update({ error: `Empalme: ${msg}`.slice(0, 300) }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
