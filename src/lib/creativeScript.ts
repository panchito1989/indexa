/**
 * Guionistas del Estudio Creativo (Claude).
 *
 * - generateScript: anuncios cortos (1-4 escenas Veo de 8s con diálogo).
 * - generateLongScript: videos largos para canales (narración TTS continua
 *   dividida en segmentos de ~15s; pocos "veo" clave + muchos "image" Ken
 *   Burns). El guion COMPLETO se escribe primero → coherencia garantizada.
 *
 * Ambos aceptan imágenes de referencia (producto/objeto/personaje del
 * proyecto): van como bloques de visión a Claude para que los prompts
 * visuales describan y usen EXACTAMENTE esos elementos.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-6";

// ── Tipos: anuncio corto ─────────────────────────────────────────────────

export interface CreativeScene {
  /** Acción/cámara de la escena, EN INGLÉS (Veo rinde mejor), sin el diálogo. */
  action: string;
  /** Diálogo hablado en español mexicano, ≤ 20 palabras (cabe en 8s). */
  dialogue: string;
}

export interface CreativeScript {
  /** Prompt EN INGLÉS para la imagen hero (fotorealista, sin texto/logos). */
  heroPrompt: string;
  scenes: CreativeScene[];
  copy: {
    primaryA: string;
    primaryB: string;
    headline: string;
    tiktokCaption: string;
  };
}

// ── Tipos: video largo (canales) ─────────────────────────────────────────

export interface LongSegment {
  /** "veo" = clip de video generado (solo momentos clave); "image" = imagen animada. */
  kind: "veo" | "image";
  /** Narración en español de ESTE segmento (~30-45 palabras; ≤20 si kind=veo). */
  narration: string;
  /** Prompt visual EN INGLÉS, estilo consistente con el resto del video. */
  visualPrompt: string;
}

export interface LongScript {
  titulo: string;
  descripcion: string;
  segments: LongSegment[];
}

export interface ProjectContext {
  nombre: string;
  nicho: string;
  descripcionNegocio: string;
  oferta: string;
  destino: string;
  tono: string;
  /** Estilo del canal para modo largo (ej. "curiosidades y misterios, tono intrigante"). */
  estiloCanal?: string;
}

// ── Llamada compartida a Claude (con visión opcional) ────────────────────

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "url"; url: string } };

async function callClaudeJson(
  system: string,
  userText: string,
  referenceUrls: string[] | undefined,
  maxTokens: number
): Promise<unknown> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY no configurada.");

  const refs = (referenceUrls || []).filter(Boolean).slice(0, 5);
  const content: ContentBlock[] = [
    ...refs.map((url): ContentBlock => ({ type: "image", source: { type: "url", url } })),
    { type: "text", text: userText },
  ];

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      temperature: 0.4,
      system,
      messages: [{ role: "user", content }],
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    let msg = `Claude HTTP ${res.status}`;
    try {
      msg = `Claude: ${JSON.parse(text)?.error?.message || msg}`;
    } catch { /* noop */ }
    throw new Error(msg);
  }

  const data = JSON.parse(text) as { content?: { type: string; text?: string }[] };
  const raw = (data.content || []).find((c) => c.type === "text")?.text || "";
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error("El guionista no devolvió JSON válido. Reintenta.");
  }
}

const REFS_NOTE = `\n\nSi el usuario adjuntó imágenes de referencia (producto, objeto o personaje), tus prompts visuales deben DESCRIBIR Y USAR EXACTAMENTE esos elementos tal como se ven (color, forma, vestimenta, rasgos) — el generador de imágenes recibirá las mismas referencias.`;

// ── Guionista de ANUNCIOS (corto) ────────────────────────────────────────

const AD_SYSTEM = `Eres director creativo de anuncios de video verticales (9:16) para Facebook/Instagram y TikTok, especializado en negocios locales hispanos. Produces guiones para videos generados con IA (Veo 3: clips de 8 segundos con voz nativa en español, encadenados).

REGLAS DEL GUION:
- Escena 1 SIEMPRE abre con un gancho que detiene el scroll en 2 segundos (pregunta de dolor o dato fuerte).
- Cada escena: máximo 20 palabras de diálogo (deben caber en 8 segundos hablados a ritmo natural).
- La última escena SIEMPRE cierra con CTA claro hacia el destino (WhatsApp/web).
- Si hay oferta/garantía, inclúyela textual — es el argumento de venta principal.
- El diálogo fluye como UNA sola narración continua repartida entre escenas (no reinicies ideas).
- Las acciones (campo "action") van EN INGLÉS, describen movimiento/cámara/gesto del MISMO personaje en el MISMO lugar (continuidad), estilo anuncio casero de smartphone, handheld sutil.
- En el diálogo, para palabras largas propensas a mala pronunciación agrega hint fonético entre paréntesis SOLO si hace falta (ej: "funcionando (foon-syoh-NAHN-doh)").
- heroPrompt: EN INGLÉS, fotorealista, vertical, persona de confianza del giro del negocio mirando a cámara, ambiente local mexicano/latino según el negocio, SIN texto ni logos ni marcas de agua.
- Copy: directo, con emojis moderados, beneficios concretos, CTA al destino.${REFS_NOTE}

Respondes SOLO con JSON válido, sin markdown ni explicaciones, con esta forma exacta:
{"heroPrompt": "...", "scenes": [{"action": "...", "dialogue": "..."}], "copy": {"primaryA": "...", "primaryB": "...", "headline": "...", "tiktokCaption": "..."}}`;

export async function generateScript(
  project: ProjectContext,
  brief: string,
  numScenes: number,
  referenceUrls?: string[]
): Promise<CreativeScript> {
  const userMsg = `NEGOCIO: ${project.nombre} (${project.nicho})
DESCRIPCIÓN: ${project.descripcionNegocio}
OFERTA: ${project.oferta}
DESTINO DEL CTA: ${project.destino}
TONO: ${project.tono}

BRIEF DEL ANUNCIO: ${brief}

Escribe el guion con EXACTAMENTE ${numScenes} escena(s).`;

  const script = (await callClaudeJson(AD_SYSTEM, userMsg, referenceUrls, 2048)) as CreativeScript;

  if (
    !script.heroPrompt ||
    !Array.isArray(script.scenes) ||
    script.scenes.length !== numScenes ||
    script.scenes.some((s) => !s.action || !s.dialogue) ||
    !script.copy?.primaryA ||
    !script.copy?.headline
  ) {
    throw new Error("Guion incompleto (escenas o copy faltantes). Reintenta.");
  }
  return script;
}

/** Prompt final de Veo para una escena de ANUNCIO (acción + voz + diálogo). */
export function buildVeoPrompt(scene: CreativeScene, sceneIndex: number): string {
  const continuity =
    sceneIndex === 0
      ? "A vertical smartphone ad."
      : "Continuation of the same vertical smartphone ad: SAME person, SAME location, same framing, and the SAME warm voice as the previous scene.";
  return `${continuity} ${scene.action} He/she speaks directly to the camera in Mexican Spanish, friendly and confident, natural lip-sync, enunciating clearly: "${scene.dialogue}" Quiet ambience, no background music.`;
}

// ── Guionista de VIDEOS LARGOS (canales) ─────────────────────────────────

const LONG_SYSTEM = `Eres guionista senior de canales de video monetizados (YouTube/Shorts) en español. Escribes guiones para videos narrados con voz en off TTS, donde los visuales se generan con IA: pocos clips de video (caros) y muchas imágenes animadas estilo documental (baratas).

REGLAS DE ORO DEL GUION:
- El SEGMENTO 1 es el gancho: las primeras 2 frases deciden si el espectador se queda. Abre con la promesa, pregunta o dato más fuerte del video. NUNCA abras con "Hola" ni "Bienvenidos".
- La narración fluye como UNA sola historia continua — cada segmento conecta con el siguiente (loops abiertos, "pero lo que pasó después...", preguntas retóricas) para sostener la retención.
- Cada segmento: 30-45 palabras de narración (~12-18 segundos hablados). EXCEPCIÓN: segmentos kind="veo" llevan ≤20 palabras.
- kind="veo" SOLO para 3-5 momentos cumbre (el gancho inicial, el clímax, una revelación, el cierre) — son clips de video generado. El resto kind="image".
- visualPrompt EN INGLÉS: describe la imagen/escena de ese segmento. TODOS los prompts comparten un MISMO estilo visual coherente (defínelo en el primero y repítelo: ej. "cinematic documentary photo, warm desaturated tones, 35mm").
- El último segmento cierra con CTA de canal: invita a suscribirse/comentar de forma natural al tema.
- titulo: título de YouTube optimizado para click (curiosidad/beneficio, sin clickbait vacío, ≤70 chars).
- descripcion: descripción de YouTube (2-3 párrafos + 3-5 hashtags).
- EL TEMA MANDA AL 100%: el video trata SOLO del TEMA/IDEA que da el usuario. El nombre del proyecto y su contexto de negocio son la CARPETA donde se organiza (el canal produce videos de varios nichos) — NUNCA los metas en el titulo, la descripcion ni la narración, salvo que el TEMA hable explícitamente de ese negocio.
- El número de segmentos lo da el usuario — respétalo EXACTAMENTE.${REFS_NOTE}

Respondes SOLO con JSON válido, sin markdown, con esta forma exacta:
{"titulo": "...", "descripcion": "...", "segments": [{"kind": "veo|image", "narration": "...", "visualPrompt": "..."}]}`;

export async function generateLongScript(
  project: ProjectContext,
  tema: string,
  targetMinutes: number,
  referenceUrls?: string[]
): Promise<LongScript> {
  // ~15s por segmento → 4 por minuto
  const numSegments = Math.max(4, Math.min(40, Math.round(targetMinutes * 4)));
  const maxVeo = targetMinutes <= 2 ? 2 : targetMinutes <= 5 ? 4 : 5;

  const userMsg = `TEMA/IDEA DEL VIDEO (esto es lo ÚNICO de lo que trata el video): ${tema}

ESTILO DEL CANAL: ${project.estiloCanal || project.tono || "narración envolvente"}
(Carpeta/proyecto donde se organiza: "${project.nombre}" — solo referencia interna, NO la menciones salvo que el TEMA sea sobre ese negocio.)

DURACIÓN OBJETIVO: ${targetMinutes} minuto(s).
Escribe EXACTAMENTE ${numSegments} segmentos. Usa kind="veo" en MÁXIMO ${maxVeo} segmentos (el gancho del segmento 1 SIEMPRE es "veo").`;

  const script = (await callClaudeJson(LONG_SYSTEM, userMsg, referenceUrls, 8192)) as LongScript;

  if (
    !script.titulo ||
    !script.descripcion ||
    !Array.isArray(script.segments) ||
    script.segments.length < Math.min(4, numSegments) ||
    script.segments.some((s) => !s.narration || !s.visualPrompt || (s.kind !== "veo" && s.kind !== "image"))
  ) {
    throw new Error("Guion largo incompleto. Reintenta.");
  }
  // Cinturón: limitar veo a maxVeo (los extra se degradan a image)
  let veoCount = 0;
  for (const s of script.segments) {
    if (s.kind === "veo") {
      veoCount++;
      if (veoCount > maxVeo) s.kind = "image";
    }
  }
  return script;
}

/** Prompt de Veo para un segmento de video LARGO (sin diálogo — narración TTS encima). */
export function buildLongVeoPrompt(segment: LongSegment): string {
  return `Cinematic shot, no people talking to camera, no on-screen text. ${segment.visualPrompt} Smooth subtle camera movement, high production value. No dialogue, ambient mood only.`;
}