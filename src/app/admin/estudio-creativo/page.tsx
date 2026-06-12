"use client";

export const dynamic = "force-dynamic";

/**
 * Estudio Creativo — dos modos:
 *
 * ANUNCIO (8-32s): brief → guion Claude → hero → escenas Veo con voz →
 * empalme → descarga / publicar EN PAUSA en Meta/TikTok.
 *
 * VIDEO LARGO (1-10 min, canales monetizables): idea → guion narrado completo
 * (segmentos editables) → TTS voz continua → visuales (imágenes Ken Burns +
 * pocas escenas Veo clave) → render con subtítulos quemados → empalme.
 *
 * Proyectos multi-nicho con personaje de marca + imágenes de REFERENCIA
 * (producto/objeto/personaje propio): el guionista las VE (Claude vision) y
 * el generador de imágenes las usa (nano-banana/edit).
 *
 * Toda la generación es por pasos idempotentes — recargar y dar "Continuar"
 * retoma donde quedó sin pagar dos veces.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { useAuth } from "@/lib/AuthContext";
import {
  Clapperboard,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Download,
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  X,
  Film,
  Youtube,
  ImagePlus,
} from "lucide-react";

// ── Tipos ────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  nombre: string;
  nicho: string;
  descripcionNegocio: string;
  oferta: string;
  destino: string;
  tono: string;
  estiloCanal?: string;
  narrationVoice?: string;
  referenceUrls?: string[];
  brandCharacterPath?: string;
}

interface SceneScript {
  action: string;
  dialogue: string;
}

interface JobScript {
  heroPrompt: string;
  scenes: SceneScript[];
  copy: { primaryA: string; primaryB: string; headline: string; tiktokCaption: string };
}

interface SceneState {
  falRequestId?: string;
  videoPath?: string;
  videoUrl?: string;
  lastFramePath?: string;
}

interface LongSegment {
  kind: "veo" | "image";
  narration: string;
  visualPrompt: string;
  audioUrl?: string;
  audioMs?: number;
  imageUrl?: string;
  videoUrl?: string;
  segUrl?: string;
}

interface Job {
  id: string;
  projectId: string;
  kind?: "ad" | "long";
  aspect?: "9:16" | "16:9";
  // ad
  brief?: string;
  numScenes?: number;
  script?: JobScript;
  scenes?: SceneState[];
  scenesDone?: number;
  heroPath?: string;
  heroUrl?: string;
  // long
  tema?: string;
  targetMinutes?: number;
  youtubeMeta?: { titulo: string; descripcion: string };
  segments?: LongSegment[];
  audioDone?: number;
  visualDone?: number;
  renderDone?: number;
  // común
  status: string;
  finalPath?: string;
  finalUrl?: string;
  error?: string;
  costoEstimadoUsd?: number;
  publishedMeta?: { adId: string; at: string };
  publishedTikTok?: { adId: string; at: string };
  createdAt?: { toMillis?: () => number };
}

const EMPTY_PROJECT = {
  nombre: "",
  nicho: "",
  descripcionNegocio: "",
  oferta: "",
  destino: "",
  tono: "confianza, urgencia ligera",
  estiloCanal: "",
  narrationVoice: "Deep_Voice_Man",
};

const VOICES = [
  { id: "Deep_Voice_Man", label: "Hombre — voz profunda" },
  { id: "Wise_Woman", label: "Mujer — voz madura" },
  { id: "Friendly_Person", label: "Voz amigable" },
];

const COST_PER_SCENE = 1.2;

type LongQuality = "premium" | "economy" | "images";

const QUALITY_OPTIONS: { id: LongQuality; label: string; desc: string }[] = [
  { id: "premium", label: "Premium (Veo)", desc: "Clips de video con IA de máxima calidad — el más caro." },
  { id: "economy", label: "Económico (Wan)", desc: "Clips de video más simples a una fracción del costo." },
  { id: "images", label: "Gratis (imágenes)", desc: "Sin clips: imágenes con movimiento suave (Ken Burns) + voz gratis. $0 si el proyecto no tiene fotos de referencia." },
];

// Voz gratis (Edge TTS) en TODOS los modos; las imágenes son GRATIS con Gemini
// (sin referencias) en modos no-premium → el costo es solo de los clips de video.
function estimateLongCost(minutes: number, quality: LongQuality): number {
  const nSeg = Math.max(4, Math.round(minutes * 4));
  const nClip = quality === "images" ? 0 : minutes <= 2 ? 2 : minutes <= 5 ? 4 : 5;
  const nImg = nSeg - nClip;
  const clip = quality === "premium" ? 0.85 : 0.25; // Veo vs Wan
  const img = quality === "premium" ? 0.04 : 0; // nano vs Gemini gratis
  return Math.round((nClip * clip + nImg * img) * 100) / 100;
}

// ── Página ───────────────────────────────────────────────────────────────

export default function EstudioCreativoPage() {
  const { user, loading, role } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [jobs, setJobs] = useState<Job[]>([]);

  // Form de proyecto
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [pform, setPform] = useState(EMPTY_PROJECT);
  const [refUrls, setRefUrls] = useState<string[]>([]);
  const [uploadingRef, setUploadingRef] = useState(false);

  // Wizard
  const [wizardTab, setWizardTab] = useState<"ad" | "long">("ad");
  const [brief, setBrief] = useState("");
  const [numScenes, setNumScenes] = useState(2);
  const [tema, setTema] = useState("");
  const [targetMinutes, setTargetMinutes] = useState(3);
  const [longAspect, setLongAspect] = useState<"16:9" | "9:16">("16:9");
  const [longQuality, setLongQuality] = useState<LongQuality>("economy");
  const [creating, setCreating] = useState(false);

  // Editores
  const [editJobId, setEditJobId] = useState<string>("");
  const [draftScript, setDraftScript] = useState<JobScript | null>(null);
  const [editLongJobId, setEditLongJobId] = useState<string>("");
  const [draftSegments, setDraftSegments] = useState<LongSegment[] | null>(null);

  // Pipeline
  const [runningJobId, setRunningJobId] = useState<string>("");
  const [stepMsg, setStepMsg] = useState("");

  // Publicar
  const [publishJob, setPublishJob] = useState<Job | null>(null);

  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedId) || null,
    [projects, selectedId]
  );

  // ── Proyectos (onSnapshot) ──
  useEffect(() => {
    if (!db || !user) return;
    const unsub = onSnapshot(collection(db, "creative_projects"), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project));
      rows.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setProjects(rows);
      setSelectedId((prev) => prev || rows[0]?.id || "");
    });
    return unsub;
  }, [user]);

  // ── Jobs del proyecto activo ──
  useEffect(() => {
    if (!db || !user || !selectedId) {
      setJobs([]);
      return;
    }
    const q = query(collection(db, "creative_jobs"), where("projectId", "==", selectedId));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Job));
      rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      setJobs(rows);
    });
    return unsub;
  }, [user, selectedId]);

  // ── API autenticada ──
  const api = useCallback(
    async (path: string, body?: unknown, method = "POST") => {
      if (!user) throw new Error("Sin sesión.");
      const token = await user.getIdToken();
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    },
    [user]
  );

  // ── Referencias: subir imagen ──
  const uploadReference = async (file: File) => {
    if (refUrls.length >= 5) {
      setMsg({ type: "error", text: "Máximo 5 imágenes de referencia." });
      return;
    }
    setUploadingRef(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await api("/api/creative/upload", { imageBase64: b64, fileName: file.name });
      setRefUrls((prev) => [...prev, res.url as string]);
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "Error subiendo imagen." });
    } finally {
      setUploadingRef(false);
    }
  };

  // ── CRUD de proyectos ──
  const saveProject = async () => {
    if (!db) return;
    if (!pform.nombre.trim() || !pform.descripcionNegocio.trim()) {
      setMsg({ type: "error", text: "Nombre y descripción son obligatorios." });
      return;
    }
    try {
      const data = { ...pform, referenceUrls: refUrls };
      if (editingProject) {
        await updateDoc(doc(db, "creative_projects", editingProject.id), data);
      } else {
        const ref = await addDoc(collection(db, "creative_projects"), {
          ...data,
          createdAt: serverTimestamp(),
        });
        setSelectedId(ref.id);
      }
      setShowProjectForm(false);
      setEditingProject(null);
      setPform(EMPTY_PROJECT);
      setRefUrls([]);
    } catch {
      setMsg({ type: "error", text: "Error guardando el proyecto." });
    }
  };

  const removeProject = async (p: Project) => {
    if (!db) return;
    if (!window.confirm(`¿Eliminar el proyecto "${p.nombre}"?`)) return;
    await deleteDoc(doc(db, "creative_projects", p.id));
    if (selectedId === p.id) setSelectedId("");
  };

  const openProjectForm = (p: Project | null) => {
    setEditingProject(p);
    if (p) {
      setPform({
        nombre: p.nombre, nicho: p.nicho, descripcionNegocio: p.descripcionNegocio,
        oferta: p.oferta, destino: p.destino, tono: p.tono,
        estiloCanal: p.estiloCanal || "", narrationVoice: p.narrationVoice || "Deep_Voice_Man",
      });
      setRefUrls(p.referenceUrls || []);
    } else {
      setPform(EMPTY_PROJECT);
      setRefUrls([]);
    }
    setShowProjectForm(true);
  };

  // ── Crear jobs ──
  const createAdJob = async () => {
    if (!selectedProject || !brief.trim()) return;
    setCreating(true);
    setMsg(null);
    try {
      const r = await api("/api/creative/jobs", {
        projectId: selectedProject.id, kind: "ad", brief: brief.trim(), numScenes,
      });
      setBrief("");
      setEditJobId(r.jobId);
      setDraftScript(r.script);
      setMsg({ type: "ok", text: "Guion listo — revísalo antes de generar." });
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "Error creando el guion." });
    } finally {
      setCreating(false);
    }
  };

  const createLongJob = async () => {
    if (!selectedProject || !tema.trim()) return;
    setCreating(true);
    setMsg(null);
    try {
      const r = await api("/api/creative/jobs", {
        projectId: selectedProject.id, kind: "long", tema: tema.trim(),
        targetMinutes, aspect: longAspect, quality: longQuality,
      });
      setTema("");
      setEditLongJobId(r.jobId);
      setDraftSegments((r.longScript?.segments as LongSegment[]) || null);
      setMsg({ type: "ok", text: `Guion de ${targetMinutes} min listo — revisa la narración antes de generar.` });
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "Error creando el guion largo." });
    } finally {
      setCreating(false);
    }
  };

  // ── Pipeline ANUNCIO ──
  const runAdPipeline = useCallback(
    async (job: Job) => {
      setRunningJobId(job.id);
      setMsg(null);
      try {
        if (!job.heroPath) {
          setStepMsg("Generando imagen hero…");
          await api("/api/creative/hero", { jobId: job.id });
        }
        const n = job.numScenes || 0;
        for (let i = job.scenesDone ?? 0; i < n; i++) {
          setStepMsg(`Generando escena ${i + 1} de ${n} (1-3 min)…`);
          let state = "pending";
          while (state === "pending") {
            const r = await api("/api/creative/scene", { jobId: job.id, index: i });
            state = r.state;
          }
        }
        if (!job.finalPath) {
          setStepMsg("Empalmando video final…");
          await api("/api/creative/stitch", { jobId: job.id });
        }
        setStepMsg("");
        setMsg({ type: "ok", text: "🎬 Video listo." });
      } catch (e) {
        setStepMsg("");
        setMsg({
          type: "error",
          text: `${e instanceof Error ? e.message : "Error."} — "Continuar" reanuda sin pagar doble.`,
        });
      } finally {
        setRunningJobId("");
      }
    },
    [api]
  );

  // ── Pipeline LARGO ──
  const runLongPipeline = useCallback(
    async (job: Job) => {
      setRunningJobId(job.id);
      setMsg(null);
      const total = job.segments?.length || 0;
      try {
        // La generación corre DESDE ESTA PESTAÑA (el panel orquesta las
        // llamadas): si se cierra, se pausa — "Continuar" reanuda donde quedó.
        const AVISO = "deja esta pestaña abierta";
        // Si la fase devuelve algo que no es pending/done, corta con error
        // claro en vez de saltar a la siguiente fase con trabajo incompleto.
        const assertState = (r: { state?: string }, fase: string) => {
          if (r.state !== "pending" && r.state !== "done") {
            throw new Error(`El paso de ${fase} devolvió una respuesta inesperada.`);
          }
        };
        // 1) Narración TTS
        let state = "pending";
        setStepMsg(`🎙 Narración con voz IA… (${total} segmentos) — ${AVISO}`);
        while (state === "pending") {
          const r = await api("/api/creative/long/audio", { jobId: job.id });
          assertState(r, "narración");
          state = r.state;
          setStepMsg(`🎙 Narración ${r.audioDone ?? "?"}/${total} — ${AVISO}`);
        }
        // 2) Visuales (imágenes + escenas Veo)
        state = "pending";
        setStepMsg(`🖼 Generando visuales (imágenes + escenas de video)… — ${AVISO}`);
        while (state === "pending") {
          const r = await api("/api/creative/long/visual", { jobId: job.id });
          assertState(r, "visuales");
          state = r.state;
          setStepMsg(`🖼 Visuales ${r.visualDone ?? "?"}/${total} — ${AVISO}`);
        }
        // 3) Render por segmento (subtítulos quemados)
        state = "pending";
        setStepMsg(`🎬 Renderizando segmentos con subtítulos… — ${AVISO}`);
        while (state === "pending") {
          const r = await api("/api/creative/long/render", { jobId: job.id });
          assertState(r, "render");
          state = r.state;
          setStepMsg(`🎬 Render ${r.renderDone ?? "?"}/${total} — ${AVISO}`);
        }
        // 4) Empalme
        if (!job.finalPath) {
          setStepMsg("Empalmando video final…");
          await api("/api/creative/long/stitch", { jobId: job.id });
        }
        setStepMsg("");
        setMsg({ type: "ok", text: "🎬 Video largo listo — título y descripción de YouTube incluidos." });
      } catch (e) {
        setStepMsg("");
        setMsg({
          type: "error",
          text: `${e instanceof Error ? e.message : "Error."} — "Continuar generación" reanuda donde quedó, sin pagar doble.`,
        });
      } finally {
        setRunningJobId("");
      }
    },
    [api]
  );

  const saveScriptAndGenerate = async () => {
    if (!editJobId || !draftScript) return;
    try {
      await api("/api/creative/jobs", { jobId: editJobId, script: draftScript }, "PUT");
      const job = jobs.find((j) => j.id === editJobId);
      setEditJobId("");
      setDraftScript(null);
      if (job) await runAdPipeline({ ...job, script: draftScript });
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "Error guardando el guion." });
    }
  };

  const saveSegmentsAndGenerate = async () => {
    if (!editLongJobId || !draftSegments) return;
    try {
      await api(
        "/api/creative/jobs",
        { jobId: editLongJobId, segments: draftSegments.map((s) => ({ kind: s.kind, narration: s.narration, visualPrompt: s.visualPrompt })) },
        "PUT"
      );
      const job = jobs.find((j) => j.id === editLongJobId);
      setEditLongJobId("");
      setDraftSegments(null);
      if (job) await runLongPipeline(job);
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "Error guardando los segmentos." });
    }
  };

  const copyText = (t: string) => {
    navigator.clipboard.writeText(t).then(() => setMsg({ type: "ok", text: "Copiado al portapapeles." }));
  };

  // ── Render ──
  if (loading) return <div className="p-8 text-gray-400">Cargando…</div>;
  if (role !== "superadmin") {
    return <div className="p-8 text-gray-500">Solo el superadmin puede usar el Estudio Creativo.</div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Clapperboard className="w-6 h-6 text-indigo-600" />
        <h1 className="text-2xl font-bold text-gray-900">Estudio Creativo</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Anuncios cortos para Meta/TikTok y videos largos para monetizar canales — tú escribes, la IA produce.
      </p>

      {msg && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium flex items-start gap-2 ${
            msg.type === "ok"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {msg.type === "ok" ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertTriangle className="w-4 h-4 mt-0.5" />}
          <span className="flex-1">{msg.text}</span>
          <button onClick={() => setMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── Proyectos ── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            className={`group flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border ${
              p.id === selectedId
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-700 border-gray-300 hover:border-indigo-400"
            }`}
          >
            {p.nombre}
            {p.id === selectedId && (
              <>
                <Pencil className="w-3.5 h-3.5 opacity-70 hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); openProjectForm(p); }} />
                <Trash2 className="w-3.5 h-3.5 opacity-70 hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); removeProject(p); }} />
              </>
            )}
          </button>
        ))}
        <button
          onClick={() => openProjectForm(null)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700"
        >
          <Plus className="w-4 h-4" /> Nuevo proyecto
        </button>
      </div>

      {/* ── Form de proyecto ── */}
      {showProjectForm && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-3">
            {editingProject ? `Editar: ${editingProject.nombre}` : "Nuevo proyecto (negocio o canal)"}
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Nombre (ej. Refris QRO / Canal Misterios)"
              value={pform.nombre} onChange={(e) => setPform({ ...pform, nombre: e.target.value })} />
            <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Nicho (ej. electrodomésticos / curiosidades)"
              value={pform.nicho} onChange={(e) => setPform({ ...pform, nicho: e.target.value })} />
            <textarea className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2" rows={2}
              placeholder="Descripción (qué hace el negocio / de qué trata el canal)"
              value={pform.descripcionNegocio} onChange={(e) => setPform({ ...pform, descripcionNegocio: e.target.value })} />
            <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Oferta/garantía (para anuncios)"
              value={pform.oferta} onChange={(e) => setPform({ ...pform, oferta: e.target.value })} />
            <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Destino del CTA (wa.me/… o URL)"
              value={pform.destino} onChange={(e) => setPform({ ...pform, destino: e.target.value })} />
            <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Tono de anuncios (ej. confianza, urgencia ligera)"
              value={pform.tono} onChange={(e) => setPform({ ...pform, tono: e.target.value })} />
            <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Estilo del canal p/ videos largos (ej. misterios, tono intrigante)"
              value={pform.estiloCanal} onChange={(e) => setPform({ ...pform, estiloCanal: e.target.value })} />
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={pform.narrationVoice} onChange={(e) => setPform({ ...pform, narrationVoice: e.target.value })}>
              {VOICES.map((v) => <option key={v.id} value={v.id}>Voz narración: {v.label}</option>)}
            </select>
          </div>

          {/* Referencias */}
          <div className="mt-3">
            <p className="text-xs font-semibold text-gray-500 mb-2">
              Imágenes de referencia (producto, objeto o personaje — la IA las usará tal cual, máx 5)
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              {refUrls.map((u, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`ref ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                  <button
                    onClick={() => setRefUrls(refUrls.filter((_, k) => k !== i))}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <label className="w-16 h-16 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 cursor-pointer hover:border-indigo-400">
                {uploadingRef ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : <ImagePlus className="w-5 h-5 text-gray-400" />}
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReference(f); e.target.value = ""; }} />
              </label>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button onClick={saveProject} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
              Guardar proyecto
            </button>
            <button onClick={() => setShowProjectForm(false)} className="text-sm text-gray-500 px-3">Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Wizard ── */}
      {selectedProject && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setWizardTab("ad")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold ${wizardTab === "ad" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}
            >
              <Send className="w-4 h-4" /> Anuncio (8-32s)
            </button>
            <button
              onClick={() => setWizardTab("long")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold ${wizardTab === "long" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600"}`}
            >
              <Youtube className="w-4 h-4" /> Video largo (1-10 min)
            </button>
          </div>

          {wizardTab === "ad" ? (
            <>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                rows={2}
                placeholder='Brief (ej. "Video de secadoras: diagnóstico gratis hoy, público amas de casa 30-55")'
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="text-sm text-gray-600">
                  Escenas:{" "}
                  <select className="border border-gray-300 rounded-lg px-2 py-1 text-sm" value={numScenes}
                    onChange={(e) => setNumScenes(Number(e.target.value))}>
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} ({n * 8}s)</option>)}
                  </select>
                </label>
                <span className="text-xs text-gray-400">≈ ${(numScenes * COST_PER_SCENE + 0.04).toFixed(2)} USD</span>
                <button
                  onClick={createAdJob}
                  disabled={creating || !brief.trim()}
                  className="ml-auto flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {creating ? "Escribiendo guion…" : "Escribir guion"}
                </button>
              </div>
            </>
          ) : (
            <>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                rows={2}
                placeholder='Idea/tema del video (ej. "5 misterios del océano que la ciencia no explica")'
                value={tema}
                onChange={(e) => setTema(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="text-sm text-gray-600">
                  Duración:{" "}
                  <select className="border border-gray-300 rounded-lg px-2 py-1 text-sm" value={targetMinutes}
                    onChange={(e) => setTargetMinutes(Number(e.target.value))}>
                    {[1, 2, 3, 5, 8, 10].map((n) => <option key={n} value={n}>{n} min{n >= 8 ? " (mid-rolls YT)" : ""}</option>)}
                  </select>
                </label>
                <label className="text-sm text-gray-600">
                  Formato:{" "}
                  <select className="border border-gray-300 rounded-lg px-2 py-1 text-sm" value={longAspect}
                    onChange={(e) => setLongAspect(e.target.value as "16:9" | "9:16")}>
                    <option value="16:9">16:9 YouTube</option>
                    <option value="9:16">9:16 Shorts/TikTok</option>
                  </select>
                </label>
                <label className="text-sm text-gray-600">
                  Calidad:{" "}
                  <select className="border border-gray-300 rounded-lg px-2 py-1 text-sm" value={longQuality}
                    onChange={(e) => setLongQuality(e.target.value as LongQuality)}>
                    {QUALITY_OPTIONS.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
                  </select>
                </label>
                <span className="text-xs text-gray-400">
                  {estimateLongCost(targetMinutes, longQuality) === 0
                    ? "GRATIS · voz + imágenes sin costo"
                    : `≈ $${estimateLongCost(targetMinutes, longQuality).toFixed(2)} USD · voz gratis`}
                </span>
                <button
                  onClick={createLongJob}
                  disabled={creating || !tema.trim()}
                  className="ml-auto flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {creating ? "Escribiendo guion…" : "Escribir guion"}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                {QUALITY_OPTIONS.find((q) => q.id === longQuality)?.desc} La voz (narración) es siempre gratis.
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Editor de guion (anuncio) ── */}
      {editJobId && draftScript && (
        <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Revisa el guion del anuncio (editable)</h2>
          {draftScript.scenes.map((s, i) => (
            <div key={i} className="mb-3 bg-white rounded-lg p-3 border border-indigo-100">
              <p className="text-xs font-bold text-indigo-600 mb-1">ESCENA {i + 1} — diálogo (≤20 palabras):</p>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                rows={2}
                value={s.dialogue}
                onChange={(e) => {
                  const scenes = [...draftScript.scenes];
                  scenes[i] = { ...scenes[i], dialogue: e.target.value };
                  setDraftScript({ ...draftScript, scenes });
                }}
              />
              <p className="text-[11px] text-gray-400 mt-1">Acción: {s.action}</p>
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={saveScriptAndGenerate}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
              <Clapperboard className="w-4 h-4" /> Generar video
            </button>
            <button onClick={() => { setEditJobId(""); setDraftScript(null); }} className="text-sm text-gray-500 px-3">
              Cerrar (queda como borrador)
            </button>
          </div>
        </div>
      )}

      {/* ── Editor de segmentos (largo) ── */}
      {editLongJobId && draftSegments && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
          <h2 className="font-semibold text-gray-900 mb-1">Revisa la narración ({draftSegments.length} segmentos)</h2>
          <p className="text-xs text-gray-500 mb-3">
            🎬 = escena de video (caro, momentos clave) · 🖼 = imagen animada. Edita la narración a tu gusto.
          </p>
          <div className="max-h-96 overflow-y-auto pr-1">
            {draftSegments.map((s, i) => (
              <div key={i} className="mb-2 bg-white rounded-lg p-3 border border-red-100">
                <p className="text-xs font-bold text-red-600 mb-1">
                  {s.kind === "veo" ? "🎬" : "🖼"} SEGMENTO {i + 1}
                </p>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  rows={2}
                  value={s.narration}
                  onChange={(e) => {
                    const segs = [...draftSegments];
                    segs[i] = { ...segs[i], narration: e.target.value };
                    setDraftSegments(segs);
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={saveSegmentsAndGenerate}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
              <Film className="w-4 h-4" /> Generar video largo
            </button>
            <button onClick={() => { setEditLongJobId(""); setDraftSegments(null); }} className="text-sm text-gray-500 px-3">
              Cerrar (queda como borrador)
            </button>
          </div>
        </div>
      )}

      {/* ── Progreso ── */}
      {runningJobId && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
          <span className="text-sm font-medium text-amber-800">{stepMsg || "Generando…"}</span>
          {(() => {
            const j = jobs.find((x) => x.id === runningJobId);
            if (j?.kind === "long" && j.segments?.length) {
              const n = j.segments.length;
              return (
                <span className="ml-auto text-xs text-amber-700 font-semibold">
                  🎙 {j.audioDone ?? 0}/{n} · 🖼 {j.visualDone ?? 0}/{n} · 🎬 {j.renderDone ?? 0}/{n}
                </span>
              );
            }
            return null;
          })()}
        </div>
      )}

      {/* ── Galería ── */}
      <div className="grid sm:grid-cols-2 gap-4">
        {jobs.map((job) => {
          const isLong = job.kind === "long";
          const isRunning = runningJobId === job.id;
          const done = !!job.finalUrl;
          const resumable = !done && !isRunning && job.status !== "script_ready";
          const title = isLong ? (job.youtubeMeta?.titulo || job.tema || "") : (job.brief || "");
          const n = job.segments?.length || 0;
          return (
            <div key={job.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-gray-900 flex-1">
                  {isLong && <Youtube className="w-3.5 h-3.5 inline mr-1 text-red-600" />}
                  {title}
                </p>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  done ? "bg-green-100 text-green-700"
                    : job.error ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {done ? "LISTO"
                    : job.error ? "ERROR"
                    : job.status === "script_ready" ? "BORRADOR"
                    : isLong
                      ? ((job.audioDone ?? 0) < n ? `🎙 ${job.audioDone ?? 0}/${n} voz`
                        : (job.visualDone ?? 0) < n ? `🖼 ${job.visualDone ?? 0}/${n} visual`
                        : `🎬 ${job.renderDone ?? 0}/${n} render`)
                      : `${job.scenesDone ?? 0}/${job.numScenes} escenas`}
                </span>
              </div>

              {done ? (
                <video controls className={`w-full rounded-lg bg-black ${job.aspect === "16:9" ? "aspect-video" : "aspect-[9/16] max-h-96"}`} src={job.finalUrl} />
              ) : job.heroUrl || job.segments?.[0]?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={job.heroUrl || job.segments?.[0]?.imageUrl} alt="preview"
                  className={`w-full rounded-lg object-cover ${job.aspect === "16:9" ? "aspect-video" : "aspect-[9/16] max-h-96"}`} />
              ) : (
                <div className={`w-full rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-sm ${job.aspect === "16:9" ? "aspect-video" : "aspect-[9/16] max-h-96"}`}>
                  {job.status === "script_ready" ? "Guion listo, sin generar" : "Sin vista previa"}
                </div>
              )}

              {job.error && <p className="mt-2 text-xs text-red-600">{job.error}</p>}

              <div className="mt-3 flex flex-wrap gap-2">
                {job.status === "script_ready" && !isRunning && (
                  <>
                    <button
                      onClick={() => {
                        if (isLong) { setEditLongJobId(job.id); setDraftSegments(job.segments || null); }
                        else { setEditJobId(job.id); setDraftScript(job.script || null); }
                      }}
                      className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Editar guion
                    </button>
                    <button
                      onClick={() => (isLong ? runLongPipeline(job) : runAdPipeline(job))}
                      className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                    >
                      <Clapperboard className="w-3.5 h-3.5" /> Generar
                    </button>
                  </>
                )}
                {resumable && (
                  <>
                    <button
                      onClick={() => (isLong ? runLongPipeline(job) : runAdPipeline(job))}
                      className="flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                    >
                      <Loader2 className="w-3.5 h-3.5" /> Continuar generación
                    </button>
                    {/* El guion largo sigue siendo editable a media generación:
                        los segmentos que cambien se regeneran, el resto
                        conserva lo ya pagado. */}
                    {isLong && (
                      <button
                        onClick={() => { setEditLongJobId(job.id); setDraftSegments(job.segments || null); }}
                        className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Editar guion
                      </button>
                    )}
                  </>
                )}
                {done && (
                  <>
                    <a href={job.finalUrl} download={`video_${job.id}.mp4`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 bg-gray-900 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">
                      <Download className="w-3.5 h-3.5" /> Descargar
                    </a>
                    {isLong ? (
                      <button
                        onClick={() => copyText(`${job.youtubeMeta?.titulo || ""}\n\n${job.youtubeMeta?.descripcion || ""}`)}
                        className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copiar título + descripción YT
                      </button>
                    ) : (
                      <>
                        <button onClick={() => setPublishJob(job)}
                          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">
                          <Send className="w-3.5 h-3.5" /> Publicar
                        </button>
                        {job.script?.copy && (
                          <button
                            onClick={() => copyText(`${job.script!.copy.primaryA}\n\nHeadline: ${job.script!.copy.headline}\n\nTikTok: ${job.script!.copy.tiktokCaption}`)}
                            className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-semibold"
                          >
                            <Copy className="w-3.5 h-3.5" /> Copiar copy
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
                {job.publishedMeta && <span className="text-[11px] text-blue-700 font-semibold self-center">✓ Meta (pausa)</span>}
                {job.publishedTikTok && <span className="text-[11px] text-pink-700 font-semibold self-center">✓ TikTok (pausa)</span>}
              </div>
            </div>
          );
        })}
        {selectedProject && jobs.length === 0 && (
          <p className="text-sm text-gray-400 col-span-2">Aún no hay videos en este proyecto — escribe tu primer brief o idea arriba.</p>
        )}
      </div>

      {publishJob && (
        <PublishModal
          job={publishJob}
          onClose={() => setPublishJob(null)}
          api={api}
          onDone={(text) => { setPublishJob(null); setMsg({ type: "ok", text }); }}
        />
      )}
    </div>
  );
}

// ── Modal de publicación (anuncios) ──────────────────────────────────────

function PublishModal({
  job,
  onClose,
  api,
  onDone,
}: {
  job: Job;
  onClose: () => void;
  api: (path: string, body?: unknown, method?: string) => Promise<Record<string, unknown>>;
  onDone: (msg: string) => void;
}) {
  const [platform, setPlatform] = useState<"meta" | "tiktok">("meta");
  const [copyVariant, setCopyVariant] = useState<"A" | "B">("A");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [metaReady, setMetaReady] = useState(false);
  const [adsets, setAdsets] = useState<{ id: string; name: string }[]>([]);
  const [adsetId, setAdsetId] = useState("");

  const [ttAdvertiser, setTtAdvertiser] = useState("");
  const [ttToken, setTtToken] = useState("");
  const [ttAdgroups, setTtAdgroups] = useState<{ adgroup_id: string; adgroup_name: string }[]>([]);
  const [ttAdgroupId, setTtAdgroupId] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await api("/api/creative/publish", { action: "meta_targets" });
        setMetaReady(Boolean(r.connected));
        setAdsets((r.adsets as { id: string; name: string }[]) || []);
      } catch {
        setMetaReady(false);
      }
    })();
  }, [api]);

  const loadTtAdgroups = async () => {
    setErr("");
    try {
      const r = await api("/api/creative/publish", {
        action: "tiktok_adgroups",
        advertiserId: ttAdvertiser.trim(),
        accessToken: ttToken.trim(),
      });
      setTtAdgroups((r.adGroups as { adgroup_id: string; adgroup_name: string }[]) || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error cargando grupos.");
    }
  };

  const publish = async () => {
    setBusy(true);
    setErr("");
    try {
      if (platform === "meta") {
        await api("/api/creative/publish", { action: "publish_meta", jobId: job.id, adsetId, copyVariant });
        onDone("✓ Anuncio creado EN PAUSA en Meta Ads — actívalo desde el Ads Manager.");
      } else {
        await api("/api/creative/publish", {
          action: "publish_tiktok",
          jobId: job.id,
          adgroupId: ttAdgroupId,
          copyVariant,
          advertiserId: ttAdvertiser.trim(),
          accessToken: ttToken.trim(),
        });
        onDone("✓ Anuncio creado EN PAUSA en TikTok Ads — actívalo desde el Ads Manager.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error publicando.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-900">Publicar (queda EN PAUSA)</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setPlatform("meta")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${platform === "meta" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600"}`}>
            Facebook / Meta
          </button>
          <button onClick={() => setPlatform("tiktok")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${platform === "tiktok" ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600"}`}>
            TikTok
          </button>
        </div>

        <label className="block text-xs font-semibold text-gray-500 mb-1">Texto del anuncio</label>
        <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
          value={copyVariant} onChange={(e) => setCopyVariant(e.target.value as "A" | "B")}>
          <option value="A">Variante A — {job.script?.copy.primaryA.slice(0, 60)}…</option>
          <option value="B">Variante B — {job.script?.copy.primaryB.slice(0, 60)}…</option>
        </select>

        {platform === "meta" ? (
          metaReady ? (
            <>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Conjunto de anuncios (adset)</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
                value={adsetId} onChange={(e) => setAdsetId(e.target.value)}>
                <option value="">— elige —</option>
                {adsets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3 mb-3">
              Conecta tu cuenta en la pestaña <b>Facebook Ads</b> primero (token + cuenta + página).
            </p>
          )
        ) : (
          <>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
              placeholder="Advertiser ID (de la pestaña TikTok Ads)"
              value={ttAdvertiser} onChange={(e) => setTtAdvertiser(e.target.value)} />
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
              placeholder="Access Token"
              value={ttToken} onChange={(e) => setTtToken(e.target.value)} />
            <div className="flex gap-2 mb-3">
              <button onClick={loadTtAdgroups} className="text-xs font-semibold text-indigo-600">
                Cargar grupos de anuncios →
              </button>
              {ttAdgroups.length > 0 && (
                <select className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                  value={ttAdgroupId} onChange={(e) => setTtAdgroupId(e.target.value)}>
                  <option value="">— elige adgroup —</option>
                  {ttAdgroups.map((g) => <option key={g.adgroup_id} value={g.adgroup_id}>{g.adgroup_name}</option>)}
                </select>
              )}
            </div>
          </>
        )}

        {err && <p className="text-xs text-red-600 mb-2">{err}</p>}

        <button
          onClick={publish}
          disabled={busy || (platform === "meta" ? !adsetId : !ttAdgroupId)}
          className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-bold"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {busy ? "Publicando…" : "Crear anuncio EN PAUSA"}
        </button>
      </div>
    </div>
  );
}
