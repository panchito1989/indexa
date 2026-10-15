/**
 * Envío inmediato del sitemap a IndexNow (Bing / Yandex / Naver / Seznam).
 *
 * Uso: node scripts/indexnow-ping.mjs [https://indexaia.com]
 *
 * Correrlo DESPUÉS de que el deploy esté en vivo: IndexNow verifica que
 * https://<host>/<clave>.txt exista antes de aceptar las URLs. La clave se lee
 * de public/<clave>.txt (es pública por diseño). El cron semanal
 * /api/cron/indexnow hace lo mismo como red de seguridad.
 *
 * Es un script independiente (no importa src/lib/indexnow.ts porque es TS),
 * así que repite la extracción de <loc>; mantener ambos en sintonía.
 */
import { readdirSync, readFileSync } from "node:fs";

const site = (process.argv[2] || "https://indexaia.com").replace(/\/$/, "");
const host = new URL(site).hostname;

const keyFile = readdirSync("public").find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (!keyFile) {
  console.error("No existe public/<clave>.txt — genera la clave antes de enviar.");
  process.exit(1);
}
const key = readFileSync(`public/${keyFile}`, "utf8").trim();

const vivo = await fetch(`${site}/${key}.txt`);
if (!vivo.ok || (await vivo.text()).trim() !== key) {
  console.error(`La clave aún no está servida en ${site}/${key}.txt (HTTP ${vivo.status}). Espera al deploy.`);
  process.exit(1);
}

const xml = await (await fetch(`${site}/sitemap.xml`)).text();
const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
  .map((m) => m[1].replace(/&amp;/g, "&"))
  .filter((u) => {
    try { return new URL(u).hostname === host; } catch { return false; }
  });

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key, keyLocation: `${site}/${key}.txt`, urlList: urls }),
});

const ok = res.status === 200 || res.status === 202;
console.log(`${urls.length} URLs de ${host} enviadas a IndexNow → HTTP ${res.status} ${ok ? "(aceptado)" : "(revisar)"}`);
process.exit(ok ? 0 : 1);
