/**
 * Rutas donde NO se muestra el botón flotante de WhatsApp: paneles internos y
 * pantallas de autenticación.
 *
 * La comparación exige coincidencia exacta o un "/" después del prefijo. Sin
 * eso, "/administracion-de-campanas" quedaría clasificada como privada por
 * empezar con "/admin".
 */
const PRIVATE_PREFIXES = ["/admin", "/agency", "/dashboard", "/login", "/registro"];

export function isPublicRoute(pathname: string): boolean {
  return !PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
