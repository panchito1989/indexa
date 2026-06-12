/**
 * Cupos mensuales por usuario — el seguro de unit economics del plan único.
 *
 * El plan de $699 MXN/mes incluye un cupo de mensajes de IA e imágenes; sin
 * tope, un cliente intensivo puede costarnos más en APIs (Claude/DALL-E) de lo
 * que paga. El rate limit por minuto solo evita ráfagas; ESTE módulo acota el
 * costo total del mes.
 *
 * - Documento: usage_quotas/{uid}_{YYYYMM} (UTC) — contador atómico por tipo.
 * - Admin/superadmin/subadmin EXENTOS (el dueño usa los mismos asistentes).
 * - FAIL-OPEN: si Firestore falla no bloqueamos a un cliente que paga; el
 *   error queda en logs.
 */

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const MONTHLY_LIMITS = {
  // Mensajes al asistente IA (compartido entre Google/Meta/TikTok Ads).
  // Peor caso ≈ $20 USD de Claude — el plan de $699 MXN nunca pierde.
  ai: 150,
  // Imágenes IA standalone (generate-image). ~$0.04 c/u.
  image: 20,
} as const;

export type QuotaKind = keyof typeof MONTHLY_LIMITS;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export interface QuotaResult {
  allowed: boolean;
  remaining: number;
  /** Mensaje listo para mostrar al usuario cuando allowed=false. */
  message?: string;
}

const EXEMPT_ROLES = new Set(["admin", "superadmin", "subadmin"]);

/**
 * Consume 1 uso del cupo mensual. Llamar DESPUÉS de autenticar y ANTES de
 * llamar a la API de pago (Claude/DALL-E/Gemini).
 */
export async function consumeMonthlyQuota(uid: string, kind: QuotaKind): Promise<QuotaResult> {
  const limit = MONTHLY_LIMITS[kind];
  try {
    const db = getAdminDb();

    const userSnap = await db.collection("usuarios").doc(uid).get();
    const role = (userSnap.data()?.role as string) || "";
    if (EXEMPT_ROLES.has(role)) {
      return { allowed: true, remaining: limit };
    }

    const now = new Date();
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const ref = db.collection("usage_quotas").doc(`${uid}_${ym}`);

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = (snap.data()?.[kind] as number) || 0;
      if (current >= limit) return { blocked: true, used: current };
      tx.set(
        ref,
        { [kind]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      return { blocked: false, used: current + 1 };
    });

    if (result.blocked) {
      const nextMonth = MESES[(now.getUTCMonth() + 1) % 12];
      return {
        allowed: false,
        remaining: 0,
        message:
          kind === "ai"
            ? `Alcanzaste los ${limit} mensajes de IA incluidos en tu plan este mes. Tu cupo se reinicia el 1 de ${nextMonth}.`
            : `Alcanzaste las ${limit} imágenes IA incluidas en tu plan este mes. Tu cupo se reinicia el 1 de ${nextMonth}.`,
      };
    }
    return { allowed: true, remaining: Math.max(0, limit - result.used) };
  } catch (err) {
    // Fail-open: nunca bloquear por un error nuestro.
    console.error(`[monthlyQuota] ${kind} uid=${uid}:`, err instanceof Error ? err.message : err);
    return { allowed: true, remaining: limit };
  }
}
