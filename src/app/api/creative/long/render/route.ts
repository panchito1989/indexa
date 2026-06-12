/**
 * Modo largo — paso 4: renderizar cada SEGMENTO (visual + narración + subtítulos).
 *
 * POST { jobId } → para cada segmento con audio+visual listos y sin segUrl:
 *   - imagen → Ken Burns (zoompan, zoom-in/out alternado) a la duración EXACTA
 *     del audio (audioMs del TTS)
 *   - veo → normaliza fps/tamaño; si la narración dura más que el clip,
 *     congela el último fotograma (tpad clone)
 *   - subtítulos quemados: narración troceada en frases cortas con tiempos
 *     proporcionales a caracteres → .srt → filtro subtitles (fuente Anton
 *     empaquetada en assets/fonts, copiada al workdir para evitar el infierno
 *     de escapado de rutas en filtros de ffmpeg)
 *   - x264 veryfast + aac, parámetros IDÉNTICOS en todos los segmentos →
 *     el stitch final es concat -c copy (instantáneo)
 *
 * Batch con presupuesto; idempotente por segmento (segUrl ya hecho = skip).
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, mkdir, rm, copyFile } from "fs/promises";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import { verifyAdmin } from "@/lib/verifyAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { saveBuffer, fetchToBuffer } from "@/lib/creativeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);
const BUDGET_MS = 230_000;
const FPS = 30;

interface Seg {
  kind: "veo" | "image";
  narration: string;
  audioUrl?: string;
  audioMs?: number;
  imageUrl?: string;
  videoUrl?: string;
  segUrl?: string;
  [k: string]: unknown;
}

// ── SRT: trocear narración con tiempos proporcionales a caracteres ──────

function msToSrt(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mm = Math.floor(ms % 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(mm, 3)}`;
}

function buildSrt(narration: string, durationMs: number): string {
  const words = narration.trim().split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 6) {
    chunks.push(words.slice(i, i + 6).join(" "));
  }
  const totalChars = chunks.reduce((a, c) => a + c.length, 0) || 1;

  let cursor = 0;
  const lines: string[] = [];
  chunks.forEach((chunk, idx) => {
    const slice = Math.round((chunk.length / totalChars) * durationMs);
    const start = cursor;
    const end = idx === chunks.length - 1 ? durationMs : Math.min(cursor + slice, durationMs);
    cursor = end;
    lines.push(`${idx + 1}\n${msToSrt(start)} --> ${msToSrt(end)}\n${chunk}\n`);
  });
  return lines.join("\n");
}

const SUB_STYLE =
  "FontName=Anton,FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,Outline=2,Shadow=0,Bold=0,Alignment=2,MarginV=50";

export async function POST(request: NextRequest) {
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

    const [W, H] = job.aspect === "16:9" ? [1280, 720] : [720, 1280];
    const segments = [...(job.segments as Seg[])];
    const deadline = Date.now() + BUDGET_MS;
    const countDone = () => segments.filter((s) => s.segUrl).length;

    const fontSrc = path.join(process.cwd(), "assets", "fonts", "Anton-Regular.ttf");

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.segUrl) continue;
      if (!seg.audioUrl || !seg.audioMs || (seg.kind === "image" ? !seg.imageUrl : !seg.videoUrl)) {
        return NextResponse.json(
          { error: `El segmento ${i + 1} aún no tiene audio/visual.` },
          { status: 409 }
        );
      }
      if (Date.now() > deadline) return NextResponse.json({ state: "pending", renderDone: countDone() });

      const D = seg.audioMs / 1000;
      const workDir = `/tmp/long-${jobId}-${i}`;
      try {
        await mkdir(workDir, { recursive: true });
        // Fuente al workdir → subtitles=seg.srt:fontsdir=. sin escapados de ruta
        await copyFile(fontSrc, path.join(workDir, "Anton-Regular.ttf"));
        await writeFile(path.join(workDir, "seg.srt"), buildSrt(seg.narration, seg.audioMs));
        await writeFile(path.join(workDir, "audio.mp3"), await fetchToBuffer(seg.audioUrl));

        let visualArgs: string[];
        let filter: string;
        if (seg.kind === "image") {
          await writeFile(path.join(workDir, "visual.jpg"), await fetchToBuffer(seg.imageUrl!));
          const frames = Math.ceil(D * FPS) + 1;
          // Ken Burns: zoom-in en pares, zoom-out en impares (pre-escala 2x evita jitter)
          const zoom =
            i % 2 === 0
              ? `min(zoom+0.0012,1.3)`
              : `if(eq(on,1),1.3,max(zoom-0.0012,1.0))`;
          visualArgs = ["-loop", "1", "-i", "visual.jpg"];
          filter = `[0:v]scale=${W * 2}:-2,zoompan=z='${zoom}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},subtitles=seg.srt:fontsdir=.:force_style='${SUB_STYLE}'[v]`;
        } else {
          await writeFile(path.join(workDir, "visual.mp4"), await fetchToBuffer(seg.videoUrl!));
          visualArgs = ["-i", "visual.mp4"];
          // Normaliza + congela último frame si la narración excede el clip
          filter = `[0:v]fps=${FPS},scale=${W}:${H},tpad=stop_mode=clone:stop_duration=60,subtitles=seg.srt:fontsdir=.:force_style='${SUB_STYLE}'[v]`;
        }

        await execFileAsync(
          ffmpegPath,
          [
            "-v", "error",
            ...visualArgs,
            "-i", "audio.mp3",
            "-filter_complex", filter,
            "-map", "[v]",
            "-map", "1:a",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            "-ar", "44100",
            "-ac", "1",
            "-t", D.toFixed(3),
            "-movflags", "+faststart",
            "out.mp4",
            "-y",
          ],
          { cwd: workDir }
        );

        const outBuf = await readFile(path.join(workDir, "out.mp4"));
        seg.segUrl = await saveBuffer(`long_${jobId}_seg_${i}.mp4`, outBuf, "video/mp4");
        segments[i] = seg;
        await jobRef.update({
          segments,
          renderDone: countDone(),
          status: "generating",
          updatedAt: FieldValue.serverTimestamp(),
        });
      } finally {
        await rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    return NextResponse.json({ state: "done", renderDone: countDone() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error renderizando segmentos.";
    console.error("[creative/long/render]", msg);
    // Persistir el error en el job para que la tarjeta muestre QUÉ falló
    if (jobRefOuter) await jobRefOuter.update({ error: `Render: ${msg}`.slice(0, 300) }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
