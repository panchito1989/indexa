/**
 * ¿`pathname` está bajo `prefijo` como segmento de ruta?
 *
 * `"/admin"` cubre `/admin` y `/admin/login`, pero NO `/administracion-de-campanas`.
 * Un `startsWith` a secas confunde ambos, y ese error ya mandó la página
 * comercial más importante del sitio al login del panel (middleware) y
 * escondió el botón de WhatsApp (flotante). Única definición para todos.
 *
 * Tolera un `/` final en el prefijo (`"/api/"` ≡ `"/api"`). El prefijo `"/"`
 * cubre todo.
 */
export function bajoPrefijo(pathname: string, prefijo: string): boolean {
  const base = prefijo.replace(/\/+$/, "");
  return pathname === base || pathname.startsWith(`${base}/`);
}
