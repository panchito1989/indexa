/**
 * Modo largo — paso 2: narración TTS por segmento.
 *
 * POST { jobId } → genera el audio de cada segmento pendiente (minimax
 * speech-02-hd, español) en loop con presupuesto de tiempo. Guarda
 * audioUrl + audioMs (duración EXACTA que devuelve el modelo — con eso el
 * render sincroniza los visuales sin ffprobe). Idempotente por segmento;
 * el panel re-llama mientras devuelva { state: "pending" }.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verifyAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { generateTts } from "@/lib/falClient";
import { saveBuffer, fetchToBuffer } from "@/lib/creativeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUDGET_MS = 240_000;

interface Seg {
  kind: string;
  narration: string;
  visualPrompt: string;
  audioUrl?: string;
  audioMs?: number;
  [k: string]: unknown;
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

    const segments = [...(job.segments as Seg[])];
    const voice = String(job.narrationVoice || "Deep_Voice_Man");
    const deadline = Date.now() + BUDGET_MS;

    let done = segments.filter((s) => s.audioUrl).length;

    for (let i = 0; i < segments.length; i++) {
      if (segments[i].audioUrl) continue;
      if (Date.now() > deadline) {
        return NextResponse.json({ state: "pending", audioDone: done });
      }

      const tts = await generateTts(segments[i].narration, voice);
      // Persistimos en nuestro CDN (las URLs de salida de fal podrían rotar)
      const buf = await fetchToBuffer(tts.audioUrl);
      const audioUrl = await saveBuffer(`long_${jobId}_audio_${i}.mp3`, buf, "audio/mpeg");

      segments[i] = { ...segments[i], audioUrl, audioMs: tts.durationMs };
      done++;
      await jobRef.update({
        segments,
        audioDone: done,
        status: "generating",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ state: "done", audioDone: done });
  } catch (err) {
    console.error("[creative/long/audio]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error generando narración." },
      { status: 500 }
    );
  }
}
