/**
 * Serializa un objeto JSON-LD para inyectarlo en
 * `<script type="application/ld+json">` con `dangerouslySetInnerHTML`.
 *
 * `JSON.stringify` no escapa `<`, `>` ni `&`: un `</script>` dentro de una
 * respuesta de FAQ cerraría la etiqueta y rompería la página. Se sustituyen por
 * sus escapes Unicode, que JSON interpreta como el mismo carácter, así que el
 * dato que leen Google y los modelos no cambia.
 */
export function jsonLdHtml(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
