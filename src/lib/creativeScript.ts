/**
 * Guionista del Estudio Creativo: Claude convierte un brief de 2-3 líneas en
 * el guion COMPLETO del anuncio (N escenas de ≤8s con diálogo y continuidad)
 * + prompt de imagen hero + copy para Meta/TikTok.
 *
 * El guion se escribe entero ANTES de generar — así la secuencia y el diálogo
 * son coherentes entre escenas aunque cada una se genere por separado.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-6";

export interface CreativeScene {
  /** Acción/cámara de la escena, EN INGLÉS (Veo rinde mejor), sin el diálogo. */
  action: string;
  /** Diálogo hablado en español mexicano, ≤ 20 palabras (cabe en 8s). */
  dialogue: string;
}

export interface CreativeScript {
  /** Prompt EN INGLÉS para la imagen hero 9:16 (fotorealista, sin texto/logos). */
  heroPrompt: string;
  scenes: CreativeScene[];
  copy: {
    primaryA: string;
    primaryB: string;
    headline: string;
    tiktokCaption: string;
  };
}

export interface ProjectContext {
  nombre: string;
  nicho: string;
  descripcionNegocio: string;
  oferta: string;
  destino: string; // WhatsApp o URL
  tono: string;
}

const SYSTEM = `Eres director creativo de anuncios de video verticales (9:16) para Facebook/Instagram y TikTok, especializado en negocios locales hispanos. Produces guiones para videos generados con IA (Veo 3: clips de 8 segundos con voz nativa en español, encadenados).

REGLAS DEL GUION:
- Escena 1 SIEMPRE abre con un gancho que detiene el scroll en 2 segundos (pregunta de dolor o dato fuerte).
- Cada escena: máximo 20 palabras de diálogo (deben caber en 8 segundos hablados a ritmo natural).
- La última escena SIEMPRE cierra con CTA claro hacia el destino (WhatsApp/web).
- Si hay oferta/garantía, inclúyela textual — es el argumento de venta principal.
- El diálogo fluye como UNA sola narración continua repartida entre escenas (no reinicies ideas).
- Las acciones (campo "action") van EN INGLÉS, describen movimiento/cámara/gesto del MISMO personaje en el MISMO lugar (continuidad), estilo anuncio casero de smartphone, handheld sutil.
- En el diálogo, para palabras largas propensas a mala pronunciación agrega hint fonético entre paréntesis SOLO si hace falta (ej: "funcionando (foon-syoh-NAHN-doh)").
- heroPrompt: EN INGLÉS, fotorealista, vertical, persona de confianza del giro del negocio mirando a cámara, ambiente local mexicano/latino según el negocio, SIN texto ni logos ni marcas de agua.
- Copy: directo, con emojis moderados, beneficios concretos, CTA al destino.

Respondes SOLO con JSON válido, sin markdown ni explicaciones, con esta forma exacta:
{"heroPrompt": "...", "scenes": [{"action": "...", "dialogue": "..."}], "copy": {"primaryA": "...", "primaryB": "...", "headline": "...", "tiktokCaption": "..."}}`;

export async function generateScript(
  project: ProjectContext,
  brief: string,
  numScenes: number
): Promise<CreativeScript> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY no configurada.");

  const userMsg = `NEGOCIO: ${project.nombre} (${project.nicho})
DESCRIPCIÓN: ${project.descripcionNegocio}
OFERTA: ${project.oferta}
DESTINO DEL CTA: ${project.destino}
TONO: ${project.tono}

BRIEF DEL ANUNCIO: ${brief}

Escribe el guion con EXACTAMENTE ${numScenes} escena(s).`;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      temperature: 0.4,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
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
  // Tolerar fences de markdown por si el modelo los agrega
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let script: CreativeScript;
  try {
    script = JSON.parse(jsonStr) as CreativeScript;
  } catch {
    throw new Error("El guionista no devolvió JSON válido. Reintenta.");
  }

  // Validación mínima
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

/** Prompt final de Veo para una escena (acción + dirección de voz + diálogo). */
export function buildVeoPrompt(scene: CreativeScene, sceneIndex: number): string {
  const continuity =
    sceneIndex === 0
      ? "A vertical smartphone ad."
      : "Continuation of the same vertical smartphone ad: SAME person, SAME location, same framing, and the SAME warm voice as the previous scene.";
  return `${continuity} ${scene.action} He/she speaks directly to the camera in Mexican Spanish, friendly and confident, natural lip-sync, enunciating clearly: "${scene.dialogue}" Quiet ambience, no background music.`;
}
