"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { useAuth } from "@/lib/AuthContext";
import {
  MessageCircle,
  Send,
  CheckCircle,
  Clock,
  ExternalLink,
  Flame,
} from "lucide-react";

/**
 * Panel de outreach USA-Hispano:
 *
 * 1. RESPONDIERON (prioridad) — prospectos con wa_priority=true. El webhook
 *    los marca al recibir mensaje; hay 24h de ventana de Meta para contestar
 *    con texto libre (vía /api/prospectos/wa-reply).
 *
 * 2. COLA DE SEGUIMIENTOS — items que el cron outreach-followups dejó en
 *    outreach_queue (modo manual): wa.me link con el mensaje d2/d5/d10 ya
 *    renderizado, listo para abrir y enviar.
 */

interface PriorityProspect {
  id: string;
  nombre: string;
  ciudad: string;
  telefono: string;
  waId: string;
  inboundText: string;
  inboundAt: Date | null;
  lastPreset: string;
}

interface QueueItem {
  id: string;
  prospectoId: string;
  nombre: string;
  ciudad: string;
  step: string;
  presetId: string;
  renderedText: string;
  waLink: string;
  createdAt: Date | null;
}

function hoursLeft24(inboundAt: Date | null): number | null {
  if (!inboundAt) return null;
  const left = 24 - (Date.now() - inboundAt.getTime()) / (1000 * 60 * 60);
  return Math.max(0, Math.round(left * 10) / 10);
}

export default function OutreachUsaPage() {
  const { user } = useAuth();
  const [priority, setPriority] = useState<PriorityProspect[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replying, setReplying] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // ── Prospectos que respondieron (wa_priority) ──
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, "prospectos_frios"),
      where("wa_priority", "==", true)
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows: PriorityProspect[] = snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: d.id,
          nombre: raw.nombre ?? "",
          ciudad: raw.ciudad ?? "",
          telefono: raw.telefono ?? "",
          waId: raw.wa_id ?? "",
          inboundText: raw.wa_last_inbound_text ?? "",
          inboundAt: raw.wa_last_inbound_at
            ? (raw.wa_last_inbound_at as Timestamp).toDate()
            : null,
          lastPreset: raw.wa_last_outreach_preset ?? "",
        };
      });
      rows.sort((a, b) => (b.inboundAt?.getTime() ?? 0) - (a.inboundAt?.getTime() ?? 0));
      setPriority(rows);
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Cola de seguimientos pendientes ──
  useEffect(() => {
    if (!db) return;
    const q = query(
      collection(db, "outreach_queue"),
      where("status", "==", "pending")
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows: QueueItem[] = snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: d.id,
          prospectoId: raw.prospectoId ?? "",
          nombre: raw.nombre ?? "",
          ciudad: raw.ciudad ?? "",
          step: raw.step ?? "",
          presetId: raw.presetId ?? "",
          renderedText: raw.renderedText ?? "",
          waLink: raw.waLink ?? "",
          createdAt: raw.createdAt ? (raw.createdAt as Timestamp).toDate() : null,
        };
      });
      rows.sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
      setQueue(rows);
    });
    return unsub;
  }, []);

  const handleReply = async (p: PriorityProspect) => {
    const text = (replyText[p.id] || "").trim();
    if (!text || !user) return;
    setReplying(p.id);
    setMessage(null);
    try {
      const authToken = await user.getIdToken();
      const res = await fetch("/api/prospectos/wa-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, prospectoId: p.id, text }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "ok", text: `Respuesta enviada a ${p.nombre}.` });
        setReplyText((prev) => ({ ...prev, [p.id]: "" }));
      } else {
        setMessage({ type: "error", text: data.message || "Error enviando respuesta." });
      }
    } catch {
      setMessage({ type: "error", text: "Error de red enviando la respuesta." });
    } finally {
      setReplying(null);
    }
  };

  const markQueueDone = async (item: QueueItem) => {
    if (!db) return;
    await updateDoc(doc(db, "outreach_queue", item.id), {
      status: "done",
      doneAt: serverTimestamp(),
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Outreach USA-Hispano</h1>
      <p className="text-sm text-gray-500 mb-6">
        Bandeja de respuestas (ventana 24h) y cola de seguimientos d2/d5/d10.
      </p>

      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            message.type === "ok"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ── Sección 1: respondieron ── */}
      <div className="flex items-center gap-2 mb-3">
        <Flame className="w-5 h-5 text-orange-500" />
        <h2 className="text-lg font-semibold text-gray-900">
          Respondieron — contesta dentro de la ventana de 24h
        </h2>
        <span className="ml-1 text-xs font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
          {priority.length}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 mb-8">Cargando…</p>
      ) : priority.length === 0 ? (
        <p className="text-sm text-gray-400 mb-8 bg-gray-50 rounded-xl p-4">
          Nadie pendiente de respuesta. 🎉
        </p>
      ) : (
        <div className="space-y-4 mb-10">
          {priority.map((p) => {
            const left = hoursLeft24(p.inboundAt);
            const phoneDigits = (p.waId || p.telefono).replace(/\D+/g, "");
            return (
              <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{p.nombre}</p>
                    <p className="text-xs text-gray-500">
                      {p.ciudad}
                      {p.lastPreset ? ` · origen: ${p.lastPreset}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {left !== null && (
                      <span
                        className={`flex items-center gap-1 px-2 py-1 rounded-full font-bold ${
                          left < 4
                            ? "bg-red-100 text-red-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        {left}h de ventana
                      </span>
                    )}
                    {phoneDigits && (
                      <a
                        href={`https://wa.me/${phoneDigits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-semibold"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Abrir WhatsApp
                      </a>
                    )}
                  </div>
                </div>

                <div className="mt-3 px-3 py-2 bg-emerald-50 border-l-4 border-emerald-400 rounded text-sm text-gray-800">
                  “{p.inboundText || "(sin texto)"}”
                </div>

                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={replyText[p.id] || ""}
                    onChange={(e) =>
                      setReplyText((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    placeholder="Respuesta rápida desde el número de INDEXA…"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => handleReply(p)}
                    disabled={replying === p.id || !(replyText[p.id] || "").trim()}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {replying === p.id ? "Enviando…" : "Enviar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Sección 2: cola de seguimientos ── */}
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-5 h-5 text-blue-500" />
        <h2 className="text-lg font-semibold text-gray-900">Cola de seguimientos (manual)</h2>
        <span className="ml-1 text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
          {queue.length}
        </span>
      </div>

      {queue.length === 0 ? (
        <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4">
          Sin seguimientos pendientes. El cron llena esta cola cada día con los d2/d5/d10 que tocan.
        </p>
      ) : (
        <div className="space-y-3">
          {queue.map((item) => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">
                    {item.nombre}
                    <span className="ml-2 text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase">
                      {item.step}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.ciudad} · {item.presetId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={item.waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir WhatsApp
                  </a>
                  <button
                    onClick={() => markQueueDone(item)}
                    className="flex items-center gap-1 bg-gray-900 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Marcar enviado
                  </button>
                </div>
              </div>
              <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">
                {item.renderedText}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
