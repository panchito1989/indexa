/**
 * Punto único de verdad del contacto de INDEXA.
 *
 * El número se puede sobreescribir con NEXT_PUBLIC_WHATSAPP_NUMBER en Vercel,
 * pero el default es el número REAL: un despliegue sin la env var no debe
 * mandar leads a un número inexistente.
 */
export const WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "525610669353";

/** Enlace wa.me con el mensaje ya codificado. */
export function whatsappUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
