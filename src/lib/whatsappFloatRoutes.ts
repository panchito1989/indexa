import { bajoPrefijo } from "./rutas";

/**
 * ¿Se muestra el botón flotante de WhatsApp de INDEXA en esta ruta?
 *
 * Se oculta en dos casos distintos:
 *   1. Paneles internos y pantallas de autenticación, donde no pinta nada.
 *   2. `/sitio/*` — los sitios generados para clientes, que montan su propio
 *      botón con el número DEL CLIENTE y su propio conteo de conversiones.
 *      Superponer el de INDEXA le robaría los leads al cliente.
 *
 * La comparación exige coincidencia exacta o un "/" después del prefijo. Sin
 * eso, "/administracion-de-campanas" quedaría oculta por empezar con "/admin".
 */
const HIDDEN_PREFIXES = [
  "/admin",
  "/agency",
  "/dashboard",
  "/login",
  "/registro",
  "/sitio",
];

export function showsWhatsAppFloat(pathname: string): boolean {
  return !HIDDEN_PREFIXES.some((prefix) => bajoPrefijo(pathname, prefix));
}
