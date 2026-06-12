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
import { generateTts, generateTtsEdge } from "@/lib/falClient";
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
  let jobRef: FirebaseFirestore.DocumentReference | null = null;
  try {
    const h = request.headers.get("authorization") || "";
    const idToken = h.startsWith("Bearer ") ? h.slice(7) : null;
    const user = idToken ? await verifyAdmin(idToken) : null;
    if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const { jobId } = (await request.json()) as { jobId?: string };
    if (!jobId) return NextResponse.json({ error: "jobId requerido." }, { status: 400 });

    const db = getAdminDb();
    jobRef = db.collection("creative_jobs").doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) return NextResponse.json({ error: "Job no encontrado." }, { status: 404 });
    const job = jobSnap.data()!;
    if (job.kind !== "long") return NextResponse.json({ error: "El job no es de modo largo." }, { status: 400 });

    // Reanudación: limpia el error del intento anterior
    if (job.error) await jobRef.update({ error: FieldValue.delete() });

    const segments = [...(job.segments as Seg[])];
    const voice = String(job.narrationVoice || "Deep_Voice_Man");
    const deadline = Date.now() + BUDGET_MS;

    let done = segments.filter((s) => s.audioUrl).length;

    for (let i = 0; i < segments.length; i++) {
      if (segments[i].audioUrl) continue;
      if (Date.now() > deadline) {
        return NextResponse.json({ state: "pending", audioDone: done });
      }

      // Voz GRATIS con Edge TTS (Microsoft, neural es-MX). Si Microsoft la
      // rompe, caemos a minimax (de pago) para no atorar el video.
      let buf: Buffer;
      let durationMs: number;
      try {
        const edge = await generateTtsEdge(segments[i].narration, voice);
        buf = edge.buffer;
        durationMs = edge.durationMs;
      } catch (edgeErr) {
        console.warn("[long/audio] Edge TTS falló, uso minimax:", edgeErr instanceof Error ? edgeErr.message : edgeErr);
        const tts = await generateTts(segments[i].narration, voice);
        buf = await fetchToBuffer(tts.audioUrl);
        durationMs = tts.durationMs;
      }
      const audioUrl = await saveBuffer(`long_${jobId}_audio_${i}.mp3`, buf, "audio/mpeg");

      segments[i] = { ...segments[i], audioUrl, audioMs: durationMs };
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
    const msg = err instanceof Error ? err.message : "Error generando narración.";
    console.error("[creative/long/audio]", msg);
    // Persistir el error en el job: sin esto la tarjeta se queda muda en
    // "0/N seg" y el admin no sabe por qué no avanza.
    if (jobRef) await jobRef.update({ error: `Narración: ${msg}`.slice(0, 300) }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
