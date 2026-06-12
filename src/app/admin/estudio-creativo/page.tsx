"use client";

export const dynamic = "force-dynamic";

/**
 * Estudio Creativo — el admin escribe un brief y sale un anuncio de video
 * completo (guion Claude → hero nano-banana → escenas Veo 3 encadenadas →
 * empalme), con descarga y publicación como anuncio EN PAUSA en Meta/TikTok.
 *
 * Multi-nicho: cada "Proyecto" guarda su negocio/oferta/destino y su
 * personaje de marca (el mismo rostro en todos los anuncios del proyecto).
 *
 * La generación se orquesta desde aquí por pasos idempotentes — si la página
 * se recarga a media generación, el botón "Continuar" reanuda donde quedó
 * (las escenas nunca se pagan dos veces: el poll reanuda por falRequestId).
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

interface Job {
  id: string;
  projectId: string;
  brief: string;
  numScenes: number;
  status: string;
  script?: JobScript;
  scenes?: SceneState[];
  scenesDone?: number;
  heroPath?: string;
  heroUrl?: string;
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
};

const COST_PER_SCENE = 1.2;

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

  // Wizard de nuevo video
  const [brief, setBrief] = useState("");
  const [numScenes, setNumScenes] = useState(2);
  const [creating, setCreating] = useState(false);

  // Edición de guion + pipeline
  const [editJobId, setEditJobId] = useState<string>("");
  const [draftScript, setDraftScript] = useState<JobScript | null>(null);
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

  // ── Jobs del proyecto activo (onSnapshot → progreso en vivo) ──
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

  // ── Helper de API autenticada ──
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

  // ── CRUD de proyectos (client Firestore — rules: isAdmin) ──
  const saveProject = async () => {
    if (!db) return;
    if (!pform.nombre.trim() || !pform.descripcionNegocio.trim() || !pform.destino.trim()) {
      setMsg({ type: "error", text: "Nombre, descripción y destino (WhatsApp/URL) son obligatorios." });
      return;
    }
    try {
      if (editingProject) {
        await updateDoc(doc(db, "creative_projects", editingProject.id), { ...pform });
      } else {
        const ref = await addDoc(collection(db, "creative_projects"), {
          ...pform,
          createdAt: serverTimestamp(),
        });
        setSelectedId(ref.id);
      }
      setShowProjectForm(false);
      setEditingProject(null);
      setPform(EMPTY_PROJECT);
    } catch {
      setMsg({ type: "error", text: "Error guardando el proyecto." });
    }
  };

  const removeProject = async (p: Project) => {
    if (!db) return;
    if (!window.confirm(`¿Eliminar el proyecto "${p.nombre}"? Los videos generados no se borran de Storage.`)) return;
    await deleteDoc(doc(db, "creative_projects", p.id));
    if (selectedId === p.id) setSelectedId("");
  };

  // ── Crear job (guion con Claude) ──
  const createJob = async () => {
    if (!selectedProject || !brief.trim()) return;
    setCreating(true);
    setMsg(null);
    try {
      const r = await api("/api/creative/jobs", {
        projectId: selectedProject.id,
        brief: brief.trim(),
        numScenes,
      });
      setBrief("");
      setEditJobId(r.jobId);
      setDraftScript(r.script);
      setMsg({ type: "ok", text: "Guion listo — revísalo y edítalo antes de generar." });
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "Error creando el guion." });
    } finally {
      setCreating(false);
    }
  };

  // ── Pipeline: hero → escenas → empalme (idempotente y reanudable) ──
  const runPipeline = useCallback(
    async (job: Job) => {
      setRunningJobId(job.id);
      setMsg(null);
      try {
        if (!job.heroPath) {
          setStepMsg("Generando imagen hero…");
          await api("/api/creative/hero", { jobId: job.id });
        }
        const start = job.scenesDone ?? 0;
        for (let i = start; i < job.numScenes; i++) {
          setStepMsg(`Generando escena ${i + 1} de ${job.numScenes} (1-3 min)…`);
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
          text: `${e instanceof Error ? e.message : "Error en la generación."} — usa "Continuar" para reanudar (no se vuelve a pagar lo ya generado).`,
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
      if (job) await runPipeline({ ...job, script: draftScript });
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "Error guardando el guion." });
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
        Escribe un brief → guion IA → video vertical con voz → descarga o publica en Meta/TikTok (en pausa).
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
                <Pencil
                  className="w-3.5 h-3.5 opacity-70 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingProject(p);
                    setPform({
                      nombre: p.nombre, nicho: p.nicho, descripcionNegocio: p.descripcionNegocio,
                      oferta: p.oferta, destino: p.destino, tono: p.tono,
                    });
                    setShowProjectForm(true);
                  }}
                />
                <Trash2
                  className="w-3.5 h-3.5 opacity-70 hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); removeProject(p); }}
                />
              </>
            )}
          </button>
        ))}
        <button
          onClick={() => { setEditingProject(null); setPform(EMPTY_PROJECT); setShowProjectForm(true); }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700"
        >
          <Plus className="w-4 h-4" /> Nuevo proyecto
        </button>
      </div>

      {/* ── Form de proyecto ── */}
      {showProjectForm && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-3">
            {editingProject ? `Editar: ${editingProject.nombre}` : "Nuevo proyecto (nicho/negocio)"}
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Nombre (ej. Refris Querétaro)"
              value={pform.nombre} onChange={(e) => setPform({ ...pform, nombre: e.target.value })} />
            <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Nicho (ej. reparación de electrodomésticos)"
              value={pform.nicho} onChange={(e) => setPform({ ...pform, nicho: e.target.value })} />
            <textarea className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2" rows={2}
              placeholder="Descripción del negocio (qué hace, zona, qué lo distingue)"
              value={pform.descripcionNegocio} onChange={(e) => setPform({ ...pform, descripcionNegocio: e.target.value })} />
            <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Oferta/garantía (ej. diagnóstico gratis; no pagas hasta ver tu equipo funcionando)"
              value={pform.oferta} onChange={(e) => setPform({ ...pform, oferta: e.target.value })} />
            <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Destino del CTA (wa.me/521… o URL)"
              value={pform.destino} onChange={(e) => setPform({ ...pform, destino: e.target.value })} />
            <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2" placeholder="Tono (ej. confianza, urgencia ligera)"
              value={pform.tono} onChange={(e) => setPform({ ...pform, tono: e.target.value })} />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={saveProject} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
              Guardar proyecto
            </button>
            <button onClick={() => setShowProjectForm(false)} className="text-sm text-gray-500 px-3">Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Wizard: nuevo video ── */}
      {selectedProject && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            Nuevo video para “{selectedProject.nombre}”
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            El guion se escribe completo primero (coherencia entre escenas garantizada) y puedes editarlo antes de generar.
          </p>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            rows={2}
            placeholder='Brief (ej. "Video de secadoras: oferta diagnóstico gratis hoy, público amas de casa 30-55")'
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="text-sm text-gray-600">
              Escenas:{" "}
              <select
                className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                value={numScenes}
                onChange={(e) => setNumScenes(Number(e.target.value))}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n} ({n * 8}s)</option>
                ))}
              </select>
            </label>
            <span className="text-xs text-gray-400">
              Costo estimado: ${(numScenes * COST_PER_SCENE + 0.04).toFixed(2)} USD
            </span>
            <button
              onClick={createJob}
              disabled={creating || !brief.trim()}
              className="ml-auto flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {creating ? "Escribiendo guion…" : "Escribir guion"}
            </button>
          </div>
        </div>
      )}

      {/* ── Editor de guion ── */}
      {editJobId && draftScript && (
        <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Revisa el guion (editable)</h2>
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
            <button
              onClick={saveScriptAndGenerate}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
            >
              <Clapperboard className="w-4 h-4" /> Generar video
            </button>
            <button onClick={() => { setEditJobId(""); setDraftScript(null); }} className="text-sm text-gray-500 px-3">
              Cerrar (queda guardado como borrador)
            </button>
          </div>
        </div>
      )}

      {/* ── Progreso de generación ── */}
      {runningJobId && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
          <span className="text-sm font-medium text-amber-800">{stepMsg || "Generando…"}</span>
        </div>
      )}

      {/* ── Galería de videos ── */}
      <div className="grid sm:grid-cols-2 gap-4">
        {jobs.map((job) => {
          const isRunning = runningJobId === job.id;
          const done = !!job.finalUrl;
          const resumable = !done && !isRunning && job.status !== "script_ready";
          return (
            <div key={job.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-gray-900 flex-1">{job.brief}</p>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    done
                      ? "bg-green-100 text-green-700"
                      : job.error
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {done ? "LISTO" : job.error ? "ERROR" : job.status === "script_ready" ? "BORRADOR" : `${job.scenesDone ?? 0}/${job.numScenes} escenas`}
                </span>
              </div>

              {done ? (
                <video controls className="w-full rounded-lg bg-black aspect-[9/16] max-h-96" src={job.finalUrl} />
              ) : job.heroUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={job.heroUrl} alt="hero" className="w-full rounded-lg aspect-[9/16] object-cover max-h-96" />
              ) : (
                <div className="w-full rounded-lg bg-gray-100 aspect-[9/16] max-h-96 flex items-center justify-center text-gray-400 text-sm">
                  {job.status === "script_ready" ? "Guion listo, sin generar" : "Sin vista previa"}
                </div>
              )}

              {job.error && <p className="mt-2 text-xs text-red-600">{job.error}</p>}

              <div className="mt-3 flex flex-wrap gap-2">
                {job.status === "script_ready" && !isRunning && (
                  <>
                    <button
                      onClick={() => { setEditJobId(job.id); setDraftScript(job.script || null); }}
                      className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Editar guion
                    </button>
                    <button
                      onClick={() => runPipeline(job)}
                      className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                    >
                      <Clapperboard className="w-3.5 h-3.5" /> Generar
                    </button>
                  </>
                )}
                {resumable && (
                  <button
                    onClick={() => runPipeline(job)}
                    className="flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                  >
                    <Loader2 className="w-3.5 h-3.5" /> Continuar generación
                  </button>
                )}
                {done && (
                  <>
                    <a
                      href={job.finalUrl}
                      download={`video_${job.id}.mp4`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 bg-gray-900 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                    >
                      <Download className="w-3.5 h-3.5" /> Descargar
                    </a>
                    <button
                      onClick={() => setPublishJob(job)}
                      className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                    >
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
                {job.publishedMeta && (
                  <span className="text-[11px] text-blue-700 font-semibold self-center">✓ Meta (pausa)</span>
                )}
                {job.publishedTikTok && (
                  <span className="text-[11px] text-pink-700 font-semibold self-center">✓ TikTok (pausa)</span>
                )}
              </div>
            </div>
          );
        })}
        {selectedProject && jobs.length === 0 && (
          <p className="text-sm text-gray-400 col-span-2">Aún no hay videos en este proyecto — escribe tu primer brief arriba.</p>
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

// ── Modal de publicación ─────────────────────────────────────────────────

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

  // Meta
  const [metaReady, setMetaReady] = useState(false);
  const [adsets, setAdsets] = useState<{ id: string; name: string }[]>([]);
  const [adsetId, setAdsetId] = useState("");

  // TikTok
  const [ttAdvertiser, setTtAdvertiser] = useState("");
  const [ttToken, setTtToken] = useState("");
  const [ttAdgroups, setTtAdgroups] = useState<{ adgroup_id: string; adgroup_name: string }[]>([]);
  const [ttAdgroupId, setTtAdgroupId] = useState("");

  // Cargar conexión Meta (mismo origen que la pestaña Facebook Ads)
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
        onDone("✓ Anuncio creado EN PAUSA en Meta Ads — actívalo desde el Ads Manager cuando quieras.");
      } else {
        await api("/api/creative/publish", {
          action: "publish_tiktok",
          jobId: job.id,
          adgroupId: ttAdgroupId,
          copyVariant,
          advertiserId: ttAdvertiser.trim(),
          accessToken: ttToken.trim(),
        });
        onDone("✓ Anuncio creado EN PAUSA en TikTok Ads — actívalo desde el Ads Manager cuando quieras.");
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
          <button
            onClick={() => setPlatform("meta")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${platform === "meta" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600"}`}
          >
            Facebook / Meta
          </button>
          <button
            onClick={() => setPlatform("tiktok")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${platform === "tiktok" ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600"}`}
          >
            TikTok
          </button>
        </div>

        <label className="block text-xs font-semibold text-gray-500 mb-1">Texto del anuncio</label>
        <select
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
          value={copyVariant}
          onChange={(e) => setCopyVariant(e.target.value as "A" | "B")}
        >
          <option value="A">Variante A — {job.script?.copy.primaryA.slice(0, 60)}…</option>
          <option value="B">Variante B — {job.script?.copy.primaryB.slice(0, 60)}…</option>
        </select>

        {platform === "meta" ? (
          metaReady ? (
            <>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Conjunto de anuncios (adset)</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
                value={adsetId}
                onChange={(e) => setAdsetId(e.target.value)}
              >
                <option value="">— elige —</option>
                {adsets.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3 mb-3">
              Conecta tu cuenta en la pestaña <b>Facebook Ads</b> primero (token + cuenta + página guardados).
            </p>
          )
        ) : (
          <>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
              placeholder="Advertiser ID (de la pestaña TikTok Ads)"
              value={ttAdvertiser}
              onChange={(e) => setTtAdvertiser(e.target.value)}
            />
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
              placeholder="Access Token"
              value={ttToken}
              onChange={(e) => setTtToken(e.target.value)}
            />
            <div className="flex gap-2 mb-3">
              <button onClick={loadTtAdgroups} className="text-xs font-semibold text-indigo-600">
                Cargar grupos de anuncios →
              </button>
              {ttAdgroups.length > 0 && (
                <select
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                  value={ttAdgroupId}
                  onChange={(e) => setTtAdgroupId(e.target.value)}
                >
                  <option value="">— elige adgroup —</option>
                  {ttAdgroups.map((g) => (
                    <option key={g.adgroup_id} value={g.adgroup_id}>{g.adgroup_name}</option>
                  ))}
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
