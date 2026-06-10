"use client";

import Script from "next/script";

/**
 * Etiqueta de Google Ads (gtag) + reporte de conversiones del sitio.
 *
 * Se renderiza solo cuando el dueño del sitio configuró conversiones vía el
 * asistente IA (sitios/{id}.googleAdsTag). Expone window.indexaReportLead()
 * para que los CTAs de WhatsApp (botón flotante, bio) reporten la conversión,
 * y además captura clics en cualquier <a href="wa.me/..."> de los templates
 * por delegación, sin tocar cada template.
 */
export default function GoogleAdsTag({ awId, label }: { awId: string; label: string }) {
  // Los valores vienen de nuestra Firestore, pero se interpolan en un <script>:
  // valida el formato exacto antes de inyectar.
  if (!/^AW-\d{6,}$/.test(awId) || !/^[\w-]+$/.test(label)) return null;

  const inline = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = window.gtag || gtag;
gtag('js', new Date());
gtag('config', '${awId}');
window.indexaReportLead = function () {
  try { (window.gtag || gtag)('event', 'conversion', { send_to: '${awId}/${label}' }); } catch (e) {}
};
document.addEventListener('click', function (e) {
  var t = e.target;
  var a = t && t.closest ? t.closest('a[href*="wa.me"], a[href*="api.whatsapp.com"]') : null;
  if (a && window.indexaReportLead) window.indexaReportLead();
}, true);
`;

  return (
    <>
      <Script
        id="indexa-gads-lib"
        src={`https://www.googletagmanager.com/gtag/js?id=${awId}`}
        strategy="afterInteractive"
      />
      <Script id="indexa-gads-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: inline }} />
    </>
  );
}
