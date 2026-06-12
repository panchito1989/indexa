/**
 * Estudio Creativo — jobs.
 *
 * POST  { projectId, brief, numScenes }  → crea el job y genera el GUION
 *        completo con Claude (escenas + hero prompt + copy). El guion queda
 *        editable hasta que arranca la generación.
 * PUT   { jobId, script }                → guarda el guion editado.
 * GET   ?projectId=...                   → lista jobs del proyecto.
 *
 * El pipeline de generación vive en /api/creative/hero|scene|stitch — cada
 * paso es una llamada corta orquestada por el panel; el estado completo vive
 * en creative_jobs (Firestore) así que recargar la página reanuda donde iba.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verifyAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import {
  generateScript,
  generateLongScript,
  type CreativeScript,
  type LongSegment,
} from "@/lib/creativeScript";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// El guion largo (hasta 40 segmentos, 8k tokens) puede tardar 1-2 min
export const maxDuration = 180;

const COST_PER_SCENE_USD = 1.2;
const COST_HERO_USD = 0.04;
// Modo largo
const COST_VEO_NOAUDIO_USD = 0.85;
const COST_IMAGE_USD = 0.04;
const COST_TTS_PER_MIN_USD = 0.3;

function bearer(request: NextRequest): string | null {
  const h = request.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

export async function POST(request: NextRequest) {
  try {
    const idToken = bearer(request);
    const user = idToken ? await verifyAdmin(idToken) : null;
    if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    if (!(await checkRateLimit(`creative-jobs:${user.uid}`, 10, 3600))) {
      return NextResponse.json(
        { error: "Límite de generaciones por hora alcanzado (10)." },
        { status: 429 }
      );
    }

    const body = (await request.json()) as {
      projectId?: string;
      kind?: string;
      brief?: string;
      numScenes?: number;
      tema?: string;
      targetMinutes?: number;
      aspect?: string;
    };
    const { projectId } = body;
    const kind = body.kind === "long" ? "long" : "ad";

    if (!projectId) {
      return NextResponse.json({ error: "projectId requerido." }, { status: 400 });
    }

    const db = getAdminDb();
    const projSnap = await db.collection("creative_projects").doc(projectId).get();
    if (!projSnap.exists) {
      return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
    }
    const p = projSnap.data()!;
    const ctx = {
      nombre: String(p.nombre || ""),
      nicho: String(p.nicho || ""),
      descripcionNegocio: String(p.descripcionNegocio || ""),
      oferta: String(p.oferta || ""),
      destino: String(p.destino || ""),
      tono: String(p.tono || "confianza"),
      estiloCanal: String(p.estiloCanal || ""),
    };
    const referenceUrls = Array.isArray(p.referenceUrls)
      ? (p.referenceUrls as unknown[]).filter((u): u is string => typeof u === "string" && !!u)
      : [];

    // ── Modo largo (canales) ──
    if (kind === "long") {
      const tema = String(body.tema || "").trim();
      const minutes = Number(body.targetMinutes);
      const aspect = body.aspect === "16:9" ? "16:9" : "9:16";
      if (!tema || !Number.isFinite(minutes) || minutes < 1 || minutes > 10) {
        return NextResponse.json(
          { error: "Faltan datos: tema y targetMinutes (1-10)." },
          { status: 400 }
        );
      }

      const script = await generateLongScript(ctx, tema, minutes, referenceUrls);
      const segments: LongSegment[] = script.segments;
      const nVeo = segments.filter((s) => s.kind === "veo").length;
      const nImg = segments.length - nVeo;
      const costo =
        Math.round(
          (nVeo * COST_VEO_NOAUDIO_USD + nImg * COST_IMAGE_USD + minutes * COST_TTS_PER_MIN_USD + 0.1) * 100
        ) / 100;

      const jobRef = await db.collection("creative_jobs").add({
        projectId,
        ownerId: user.uid,
        kind: "long",
        tema,
        targetMinutes: minutes,
        aspect,
        narrationVoice: String(p.narrationVoice || "Deep_Voice_Man"),
        status: "script_ready",
        youtubeMeta: { titulo: script.titulo, descripcion: script.descripcion },
        segments: segments.map((s) => ({ kind: s.kind, narration: s.narration, visualPrompt: s.visualPrompt })),
        audioDone: 0,
        visualDone: 0,
        renderDone: 0,
        costoEstimadoUsd: costo,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true, jobId: jobRef.id, longScript: script });
    }

    // ── Modo anuncio (original) ──
    const brief = String(body.brief || "");
    const n = Number(body.numScenes);
    if (!brief.trim() || !Number.isInteger(n) || n < 1 || n > 4) {
      return NextResponse.json(
        { error: "Faltan datos: brief y numScenes (1-4)." },
        { status: 400 }
      );
    }

    const script = await generateScript(ctx, brief.trim(), n, referenceUrls);

    const jobRef = await db.collection("creative_jobs").add({
      projectId,
      ownerId: user.uid,
      kind: "ad",
      aspect: "9:16",
      brief: brief.trim(),
      numScenes: n,
      status: "script_ready",
      script,
      scenes: [],
      scenesDone: 0,
      costoEstimadoUsd: Math.round((n * COST_PER_SCENE_USD + COST_HERO_USD) * 100) / 100,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, jobId: jobRef.id, script });
  } catch (err) {
    console.error("[creative/jobs POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error creando el job." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const idToken = bearer(request);
    const user = idToken ? await verifyAdmin(idToken) : null;
    if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const { jobId, script, segments } = (await request.json()) as {
      jobId?: string;
      script?: CreativeScript;
      segments?: LongSegment[];
    };
    if (!jobId) return NextResponse.json({ error: "jobId requerido." }, { status: 400 });

    const db = getAdminDb();
    const ref = db.collection("creative_jobs").doc(jobId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Job no encontrado." }, { status: 404 });
    const job = snap.data()!;
    if (job.status !== "script_ready") {
      return NextResponse.json(
        { error: "El guion solo se puede editar antes de generar." },
        { status: 409 }
      );
    }

    // Edición de segmentos (modo largo)
    if (job.kind === "long") {
      if (
        !Array.isArray(segments) ||
        segments.length !== (job.segments as unknown[]).length ||
        segments.some((s) => !s.narration?.trim() || !s.visualPrompt?.trim() || (s.kind !== "veo" && s.kind !== "image"))
      ) {
        return NextResponse.json(
          { error: "segments inválidos (misma cantidad, con narración y prompt)." },
          { status: 400 }
        );
      }
      await ref.update({
        segments: segments.map((s) => ({ kind: s.kind, narration: s.narration.trim(), visualPrompt: s.visualPrompt.trim() })),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true });
    }

    // Edición de guion (modo anuncio)
    if (!script?.scenes?.length || !script.heroPrompt) {
      return NextResponse.json({ error: "script válido requerido." }, { status: 400 });
    }
    if (script.scenes.length !== job.numScenes) {
      return NextResponse.json(
        { error: `El guion debe tener ${job.numScenes} escena(s).` },
        { status: 400 }
      );
    }

    await ref.update({ script, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[creative/jobs PUT]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error guardando el guion." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const idToken = bearer(request);
    const user = idToken ? await verifyAdmin(idToken) : null;
    if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return NextResponse.json({ error: "projectId requerido." }, { status: 400 });

    const db = getAdminDb();
    // Sin orderBy para no requerir índice compuesto; se ordena en código
    // (los jobs por proyecto son pocos).
    const snap = await db
      .collection("creative_jobs")
      .where("projectId", "==", projectId)
      .limit(100)
      .get();

    const jobs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>))
      .sort((a, b) => {
        const ta = (a.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
        const tb = (b.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
        return tb - ta;
      });
    return NextResponse.json({ success: true, jobs });
  } catch (err) {
    console.error("[creative/jobs GET]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error listando jobs." }, { status: 500 });
  }
}
