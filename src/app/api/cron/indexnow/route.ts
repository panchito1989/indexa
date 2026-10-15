import { NextRequest, NextResponse } from "next/server";
import { enviarIndexNow, urlsDeSitemap } from "@/lib/indexnow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron — semanal. Lee el sitemap de producción y reenvía todas sus
 * URLs a IndexNow (Bing, Yandex, Naver, Seznam). Es la red de seguridad: el
 * envío inmediato tras un deploy se hace con `scripts/indexnow-ping.mjs`.
 *
 * ~60 URLs a la semana está muy por debajo de cualquier límite del protocolo
 * y garantiza que ninguna página nueva se quede fuera del índice de Bing —
 * que es el que ChatGPT usa para buscar.
 */
const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://indexaia.com";
const SITE_URL = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const host = new URL(SITE_URL).hostname;

  const sitemap = await fetch(`${SITE_URL}/sitemap.xml`, { cache: "no-store" });
  if (!sitemap.ok) {
    console.error(`CRON indexnow: sitemap respondió ${sitemap.status}`);
    return NextResponse.json({ error: `sitemap ${sitemap.status}` }, { status: 502 });
  }

  const urls = urlsDeSitemap(await sitemap.text());
  const resultado = await enviarIndexNow(host, urls);

  if (!resultado.aceptado) {
    console.error(`CRON indexnow: IndexNow respondió ${resultado.status} para ${resultado.enviadas} URLs`);
  }

  return NextResponse.json({ host, ...resultado }, { status: resultado.aceptado ? 200 : 502 });
}
