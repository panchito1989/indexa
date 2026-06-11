/**
 * Emails de retención de clientes pagando (mercado completo, copy es-MX).
 *
 * Piezas del funnel anti-churn:
 *   - Dunning (pago fallido): 3 toques — inmediato, día 3, día 7.
 *   - Reporte de valor mensual: "esto te trajo tu inversión este mes".
 *   - Win-back: cancelados/vencidos 7-30 días, garantía doble.
 *   - Encuesta de cancelación: 1 pregunta, 4 botones.
 *
 * Estilo visual: el de trial-reminders (header #002366, CTA #FF6600).
 * Envío vía Resend (lazy singleton). Los senders NUNCA lanzan — la
 * retención no debe romper webhooks ni crons.
 */

import { Resend } from "resend";
import { getAdminDb } from "./firebaseAdmin";

const FROM_EMAIL = process.env.FROM_EMAIL || "INDEXA <onboarding@resend.dev>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://indexaia.com";

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export interface EmailContent {
  subject: string;
  html: string;
}

/** Carcasa visual compartida (header INDEXA + footer). */
function shell(inner: string): string {
  return `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333333;">
      <div style="background-color: #002366; padding: 32px; text-align: center;">
        <h1 style="color: #FFFFFF; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">INDEXA</h1>
      </div>
      <div style="padding: 32px; background-color: #FFFFFF;">
        ${inner}
      </div>
      <div style="background-color: #002366; padding: 20px; text-align: center;">
        <p style="color: rgba(255,255,255,0.6); font-size: 12px; margin: 0;">
          &copy; ${new Date().getFullYear()} INDEXA
        </p>
      </div>
    </div>
  `;
}

function ctaButton(href: string, label: string): string {
  return `
    <div style="text-align: center; margin: 28px 0;">
      <a href="${href}" target="_blank" rel="noopener noreferrer"
        style="display: inline-block; background-color: #FF6600; color: #FFFFFF; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-weight: 800; font-size: 17px; letter-spacing: 0.3px;">
        ${label}
      </a>
    </div>
  `;
}

// ── Dunning (pago fallido) ──────────────────────────────────────────────

export function buildDunningEmail(
  step: 1 | 2 | 3,
  opts: { nombre: string; negocio: string; payUrl: string }
): EmailContent {
  const nombre = escapeHtml(opts.nombre || "");
  const negocio = escapeHtml(opts.negocio || "tu negocio");
  const payUrl = opts.payUrl || `${SITE_URL}/dashboard`;

  if (step === 1) {
    return {
      subject: "Tu pago no pasó — tu sitio sigue activo (por ahora)",
      html: shell(`
        <h2 style="color: #002366; margin-top: 0;">Hola, ${nombre}</h2>
        <p style="font-size: 16px; line-height: 1.6;">
          Intentamos procesar tu pago mensual de INDEXA para <strong>${negocio}</strong> y el banco lo rechazó.
          Tranquilo: <strong>tu sitio y tus campañas siguen activos</strong>.
        </p>
        <p style="font-size: 16px; line-height: 1.6;">
          Esto pasa más seguido de lo que crees — tarjeta vencida, límite alcanzado o un bloqueo del banco.
          Se arregla en 2 minutos:
        </p>
        ${ctaButton(payUrl, "Actualizar mi método de pago →")}
        <div style="margin: 16px 0; padding: 16px 20px; background-color: #FEF3C7; border-radius: 12px; border: 1px solid #FCD34D;">
          <p style="margin: 0; font-size: 14px; color: #92400E;">
            <strong>Importante:</strong> si el pago no se procesa en los próximos 7 días, tendremos que pausar
            tu sitio y tus anuncios — y los clientes que hoy te encuentran en Google dejarán de verte.
          </p>
        </div>
        <p style="font-size: 14px; line-height: 1.6; color: #666;">
          ¿Algún problema con el pago? Responde este correo y lo resolvemos juntos.
        </p>
      `),
    };
  }

  if (step === 2) {
    return {
      subject: "Seguimos sin poder procesar tu pago — no pierdas tus clientes",
      html: shell(`
        <h2 style="color: #002366; margin-top: 0;">Hola, ${nombre}</h2>
        <p style="font-size: 16px; line-height: 1.6;">
          Hace 3 días tu pago mensual no pasó y seguimos sin poder procesarlo.
          Tu sitio sigue en línea, pero <strong>quedan 4 días</strong> antes de tener que pausarlo.
        </p>
        <p style="font-size: 16px; line-height: 1.6;">
          Piensa en lo que está en juego: este mes tu página recibió visitas y contactos de gente que
          te estaba buscando — si el sitio se pausa, esos clientes terminan con tu competencia.
        </p>
        ${ctaButton(payUrl, "Actualizar mi pago ahora →")}
        <p style="font-size: 14px; line-height: 1.6; color: #666;">
          Y si estás pasando por un momento complicado con el negocio, respóndenos:
          preferimos buscar una solución contigo que pausar tu sitio.
        </p>
      `),
    };
  }

  return {
    subject: "Aviso final: tu sitio se pausa mañana",
    html: shell(`
      <h2 style="color: #002366; margin-top: 0;">Hola, ${nombre}</h2>
      <div style="margin: 16px 0 24px; padding: 16px 20px; background-color: #FEE2E2; border-radius: 12px; border: 1px solid #FCA5A5; text-align: center;">
        <p style="margin: 0; font-size: 18px; color: #991B1B; font-weight: 700;">
          Mañana tu sitio y tus campañas se pausan
        </p>
      </div>
      <p style="font-size: 16px; line-height: 1.6;">
        Han pasado 7 días desde que tu pago no se pudo procesar. Todo lo que construimos
        (tu página, tu posicionamiento, tus anuncios) <strong>queda guardado</strong> y se reactiva
        en cuanto el pago pase — pero mientras esté pausado, eres invisible para los clientes que te buscan.
      </p>
      ${ctaButton(payUrl, "Reactivar mi pago →")}
      <p style="font-size: 14px; line-height: 1.6; color: #666;">
        Si decidiste no continuar, también lo entendemos: responde este correo y cerramos todo
        en orden, sin cargos pendientes.
      </p>
    `),
  };
}

// ── Reporte de valor mensual ────────────────────────────────────────────

export function buildValueReportEmail(opts: {
  nombre: string;
  negocio: string;
  vistasMes: number;
  clicsMes: number;
  bioClicksMes: number;
  /** true en la primera corrida (sin snapshot previo) — acumulado histórico. */
  esPrimerReporte: boolean;
}): EmailContent {
  const nombre = escapeHtml(opts.nombre || "");
  const negocio = escapeHtml(opts.negocio || "tu negocio");
  const contactos = opts.clicsMes;
  const periodo = opts.esPrimerReporte ? "desde que empezaste con INDEXA" : "este mes";

  const statRow = (valor: number, label: string) => `
    <tr>
      <td style="padding: 12px 16px; font-size: 28px; font-weight: 800; color: #002366; width: 90px; text-align: right;">${valor.toLocaleString("es-MX")}</td>
      <td style="padding: 12px 16px; font-size: 15px; color: #333;">${label}</td>
    </tr>
  `;

  return {
    subject: `${periodo === "este mes" ? "Este mes" : "Hasta hoy"} INDEXA le trajo ${contactos.toLocaleString("es-MX")} contactos a ${negocio}`,
    html: shell(`
      <h2 style="color: #002366; margin-top: 0;">Hola, ${nombre}</h2>
      <p style="font-size: 16px; line-height: 1.6;">
        Aquí está lo que tu inversión en INDEXA trabajó por ti ${periodo}:
      </p>
      <table style="width: 100%; border-collapse: collapse; background: #F8FAFC; border-radius: 12px; margin: 20px 0;">
        ${statRow(opts.vistasMes, "personas visitaron tu página")}
        ${statRow(opts.clicsMes, "hicieron clic para escribirte por WhatsApp")}
        ${statRow(opts.bioClicksMes, "llegaron desde tus redes (link en bio)")}
      </table>
      <p style="font-size: 16px; line-height: 1.6;">
        Cada uno de esos contactos es alguien que te buscó, te encontró y dio el paso de escribirte.
        <strong>Si cerraste aunque sea uno, tu plan ya se pagó solo.</strong>
      </p>
      <p style="font-size: 16px; line-height: 1.6;">
        ¿Quieres que el próximo mes estos números crezcan? Un plan superior incluye más anuncios y más alcance:
      </p>
      ${ctaButton(`${SITE_URL}/dashboard`, "Ver opciones de mi plan →")}
      <p style="font-size: 14px; line-height: 1.6; color: #666;">
        Cualquier duda sobre tus números, responde este correo.
      </p>
    `),
  };
}

// ── Win-back (cancelados/vencidos 7-30 días) ────────────────────────────

export function buildWinbackEmail(opts: {
  nombre: string;
  negocio: string;
}): EmailContent {
  const nombre = escapeHtml(opts.nombre || "");
  const negocio = escapeHtml(opts.negocio || "tu negocio");

  return {
    subject: `${opts.nombre || "Hola"}, te guardamos todo — vuelve con garantía doble`,
    html: shell(`
      <h2 style="color: #002366; margin-top: 0;">Hola, ${nombre}</h2>
      <p style="font-size: 16px; line-height: 1.6;">
        Hace unas semanas tu plan de INDEXA quedó pausado, pero queremos que sepas algo:
        <strong>tu sitio, tus textos, tus fotos y tu posicionamiento siguen guardados, intactos.</strong>
      </p>
      <p style="font-size: 16px; line-height: 1.6;">
        Y mientras tu página está fuera de línea, la gente de tu zona sigue buscando tu servicio
        en Google... y encontrando a otros.
      </p>
      <div style="margin: 24px 0; padding: 20px; background-color: #ECFDF5; border-radius: 12px; border: 1px solid #6EE7B7; text-align: center;">
        <p style="margin: 0 0 6px; font-size: 18px; color: #065F46; font-weight: 800;">
          Oferta para volver: garantía DOBLE — 60 días
        </p>
        <p style="margin: 0; font-size: 14px; color: #047857;">
          Reactiva este mes y si en 2 meses no ves leads, el tercero va por nuestra cuenta.
        </p>
      </div>
      ${ctaButton(`${SITE_URL}/dashboard`, "Reactivar mi sitio →")}
      <p style="font-size: 14px; line-height: 1.6; color: #666;">
        ${negocio} vuelve a estar en línea el mismo día, sin costos de setup y sin empezar de cero.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #666;">
        ¿Cancelaste por algo que hicimos mal? Responde este correo y cuéntanos — leemos todo.
      </p>
    `),
  };
}

// ── Encuesta de cancelación ─────────────────────────────────────────────

export function buildCancelSurveyEmail(opts: {
  nombre: string;
  sitioId: string;
}): EmailContent {
  const nombre = escapeHtml(opts.nombre || "");
  const base = `${SITE_URL}/api/cancel-survey?sid=${encodeURIComponent(opts.sitioId)}&reason=`;

  const optionBtn = (reason: string, label: string) => `
    <a href="${base}${reason}" target="_blank" rel="noopener noreferrer"
      style="display: block; background-color: #F1F5F9; color: #002366; padding: 14px 20px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; margin-bottom: 10px; border: 1px solid #E2E8F0; text-align: center;">
      ${label}
    </a>
  `;

  return {
    subject: "Una pregunta rápida (de verdad, solo una)",
    html: shell(`
      <h2 style="color: #002366; margin-top: 0;">Hola, ${nombre}</h2>
      <p style="font-size: 16px; line-height: 1.6;">
        Tu plan quedó cancelado — sin cargos pendientes y sin letras chiquitas.
        Tu sitio queda guardado por si algún día quieres volver.
      </p>
      <p style="font-size: 16px; line-height: 1.6;">
        Antes de despedirnos: ¿nos dices qué fue lo que más pesó? Un clic y listo:
      </p>
      <div style="margin: 24px 0;">
        ${optionBtn("precio", "El precio")}
        ${optionBtn("resultados", "No vi resultados")}
        ${optionBtn("negocio", "Pausé o cerré el negocio")}
        ${optionBtn("otro", "Otra cosa")}
      </div>
      <p style="font-size: 14px; line-height: 1.6; color: #666;">
        Gracias por habernos dado la oportunidad. Las puertas quedan abiertas.
      </p>
    `),
  };
}

// ── Envío + helpers ─────────────────────────────────────────────────────

/**
 * Envía un email de retención. Nunca lanza — devuelve false en error.
 */
export async function sendRetentionEmail(
  to: string,
  content: EmailContent
): Promise<boolean> {
  const resend = getResend();
  if (!resend || !to) {
    console.warn("[retentionEmails] Skipping — RESEND_API_KEY o destinatario faltante");
    return false;
  }
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: content.subject,
      html: content.html,
    });
    if (error) {
      console.error("[retentionEmails] Resend error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[retentionEmails] Error inesperado:", err);
    return false;
  }
}

/**
 * Resuelve el email y nombre del dueño de un sitio:
 * sitios.ownerId → usuarios.{email,displayName}; fallback sitios.email.
 * Nunca lanza — devuelve null si no hay forma de contactarlo.
 */
export async function resolveOwnerContact(sitioData: {
  ownerId?: string;
  email?: string;
  nombre?: string;
}): Promise<{ email: string; nombre: string } | null> {
  try {
    if (sitioData.ownerId) {
      const db = getAdminDb();
      const userSnap = await db.collection("usuarios").doc(sitioData.ownerId).get();
      const user = userSnap.data();
      if (user?.email) {
        return {
          email: String(user.email),
          nombre: String(user.displayName || sitioData.nombre || ""),
        };
      }
    }
  } catch (err) {
    console.error("[retentionEmails] resolveOwnerContact error:", err instanceof Error ? err.message : err);
  }
  if (sitioData.email) {
    return { email: String(sitioData.email), nombre: String(sitioData.nombre || "") };
  }
  return null;
}
