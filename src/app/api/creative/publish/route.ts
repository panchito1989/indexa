/**
 * Estudio Creativo — publicación como anuncio EN PAUSA.
 *
 * POST (action en body, todo con verifyAdmin):
 *   - meta_targets    → ¿hay conexión Meta guardada? + lista de adsets
 *   - tiktok_adgroups → lista de adgroups (creds en body, como las páginas TikTok)
 *   - publish_meta    → advideos (file_url) → poll procesamiento → adcreative
 *                       video_data → ad PAUSED en el adset elegido
 *   - publish_tiktok  → uploadVideoByUrl + createAd (helpers existentes) →
 *                       updateAdStatus DISABLE (queda en pausa)
 *
 * Las credenciales de Meta salen de usuarios/{uid} (mismas que la pestaña
 * Facebook Ads: metaAccessToken cifrado + metaAdAccountId + metaPageId).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verifyAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { decryptToken, isEncrypted } from "@/lib/tokenCrypto";
import { signedUrl } from "@/lib/creativeStorage";
import {
  getAdGroups,
  uploadVideoByUrl,
  createAd,
  updateAdStatus,
  type TikTokCredentials,
} from "@/lib/tiktokAdsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const META_GRAPH_URL = "https://graph.facebook.com/v21.0";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function graphJson(
  url: string,
  body: Record<string, unknown>,
  label: string
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  const error = json.error as { message?: string } | undefined;
  if (!res.ok || error) {
    throw new Error(`Meta ${label}: ${error?.message || `HTTP ${res.status}`}`);
  }
  return json;
}

interface MetaCreds {
  token: string;
  actId: string;
  pageId: string;
}

async function loadMetaCreds(uid: string): Promise<MetaCreds | null> {
  const db = getAdminDb();
  const snap = await db.collection("usuarios").doc(uid).get();
  const u = snap.data() || {};
  let token = typeof u.metaAccessToken === "string" ? u.metaAccessToken : "";
  if (token && isEncrypted(token)) token = decryptToken(token);
  const actId = String(u.metaAdAccountId || "").replace("act_", "");
  const pageId = String(u.metaPageId || "");
  if (!token || !actId || !pageId) return null;
  return { token, actId, pageId };
}

function normalizeLink(destino: string): string {
  const d = (destino || "").trim();
  if (!d) return "https://indexaia.com";
  if (d.startsWith("http")) return d;
  return `https://${d}`;
}

export async function POST(request: NextRequest) {
  try {
    const h = request.headers.get("authorization") || "";
    const idToken = h.startsWith("Bearer ") ? h.slice(7) : null;
    const user = idToken ? await verifyAdmin(idToken) : null;
    if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "");
    const db = getAdminDb();

    // ── Conexión Meta + lista de adsets ──
    if (action === "meta_targets") {
      const creds = await loadMetaCreds(user.uid);
      if (!creds) return NextResponse.json({ connected: false, adsets: [] });

      const res = await fetch(
        `${META_GRAPH_URL}/act_${creds.actId}/adsets?fields=id,name,status,campaign{name}&limit=100&access_token=${encodeURIComponent(creds.token)}`
      );
      const json = (await res.json()) as {
        data?: Array<{ id: string; name: string; status: string; campaign?: { name?: string } }>;
        error?: { message?: string };
      };
      if (json.error) return NextResponse.json({ connected: false, adsets: [], error: json.error.message });

      const adsets = (json.data || []).map((a) => ({
        id: a.id,
        name: `${a.campaign?.name ? a.campaign.name + " › " : ""}${a.name}${a.status !== "ACTIVE" ? ` (${a.status})` : ""}`,
      }));
      return NextResponse.json({ connected: true, adsets });
    }

    // ── Lista de adgroups TikTok ──
    if (action === "tiktok_adgroups") {
      const creds: TikTokCredentials = {
        advertiserId: String(body.advertiserId || ""),
        accessToken: String(body.accessToken || ""),
      };
      if (!creds.advertiserId || !creds.accessToken) {
        return NextResponse.json({ error: "Advertiser ID y Access Token requeridos." }, { status: 400 });
      }
      const { adGroups } = await getAdGroups(creds);
      return NextResponse.json({
        adGroups: adGroups.map((g) => ({ adgroup_id: g.adgroupId ?? (g as unknown as Record<string, unknown>).adgroup_id, adgroup_name: g.adgroupName ?? (g as unknown as Record<string, unknown>).adgroup_name })),
      });
    }

    // ── Cargar job + proyecto (común a publish_*) ──
    const jobId = String(body.jobId || "");
    if (!jobId) return NextResponse.json({ error: "jobId requerido." }, { status: 400 });
    const jobRef = db.collection("creative_jobs").doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) return NextResponse.json({ error: "Job no encontrado." }, { status: 404 });
    const job = jobSnap.data()!;
    if (!job.finalPath) return NextResponse.json({ error: "El video aún no está listo." }, { status: 409 });

    const projSnap = await db.collection("creative_projects").doc(String(job.projectId)).get();
    const project = projSnap.data() || {};
    const link = normalizeLink(String(project.destino || ""));

    const copy = (job.script?.copy || {}) as Record<string, string>;
    const variant = String(body.copyVariant || "A");
    const message = variant === "B" && copy.primaryB ? copy.primaryB : copy.primaryA || job.brief;

    const videoUrl = await signedUrl(String(job.finalPath), 1);

    // ── Publicar en Meta (anuncio de video EN PAUSA) ──
    if (action === "publish_meta") {
      const adsetId = String(body.adsetId || "");
      if (!adsetId) return NextResponse.json({ error: "adsetId requerido." }, { status: 400 });
      const creds = await loadMetaCreds(user.uid);
      if (!creds) {
        return NextResponse.json(
          { error: "Conecta tu cuenta en la pestaña Facebook Ads primero (token, cuenta y página)." },
          { status: 409 }
        );
      }

      // 1) Subir video por URL
      const up = await graphJson(
        `${META_GRAPH_URL}/act_${creds.actId}/advideos`,
        { file_url: videoUrl, name: `EstudioCreativo ${jobId}`, access_token: creds.token },
        "advideos"
      );
      const videoId = String(up.id || "");
      if (!videoId) throw new Error("Meta no devolvió id de video.");

      // 2) Esperar procesamiento (los anuncios fallan si el video no está ready)
      const deadline = Date.now() + 180_000;
      let ready = false;
      while (Date.now() < deadline) {
        const st = await fetch(
          `${META_GRAPH_URL}/${videoId}?fields=status&access_token=${encodeURIComponent(creds.token)}`
        );
        const sj = (await st.json()) as { status?: { video_status?: string } };
        const vs = sj.status?.video_status;
        if (vs === "ready") { ready = true; break; }
        if (vs === "error") throw new Error("Meta no pudo procesar el video.");
        await sleep(5000);
      }
      if (!ready) throw new Error("El video sigue procesándose en Meta — reintenta en un minuto.");

      // 3) Creative de video (thumbnail = imagen hero)
      const heroUrl = job.heroPath ? await signedUrl(String(job.heroPath), 1) : undefined;
      const creative = await graphJson(
        `${META_GRAPH_URL}/act_${creds.actId}/adcreatives`,
        {
          name: `EstudioCreativo ${jobId} - Creative`,
          object_story_spec: {
            page_id: creds.pageId,
            video_data: {
              video_id: videoId,
              ...(heroUrl ? { image_url: heroUrl } : {}),
              message,
              title: copy.headline || undefined,
              call_to_action: { type: "LEARN_MORE", value: { link } },
            },
          },
          access_token: creds.token,
        },
        "adcreatives"
      );

      // 4) Anuncio EN PAUSA en el adset elegido
      const ad = await graphJson(
        `${META_GRAPH_URL}/act_${creds.actId}/ads`,
        {
          name: `EstudioCreativo ${jobId}`,
          adset_id: adsetId,
          creative: { creative_id: creative.id },
          status: "PAUSED",
          access_token: creds.token,
        },
        "ads"
      );

      await jobRef.update({
        publishedMeta: { adId: String(ad.id), at: new Date().toISOString() },
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true, adId: ad.id, videoId });
    }

    // ── Publicar en TikTok (anuncio EN PAUSA) ──
    if (action === "publish_tiktok") {
      const adgroupId = String(body.adgroupId || "");
      const creds: TikTokCredentials = {
        advertiserId: String(body.advertiserId || ""),
        accessToken: String(body.accessToken || ""),
      };
      if (!adgroupId || !creds.advertiserId || !creds.accessToken) {
        return NextResponse.json(
          { error: "adgroupId, advertiserId y accessToken requeridos." },
          { status: 400 }
        );
      }

      const { videoId } = await uploadVideoByUrl(creds, videoUrl, `estudio_${jobId}.mp4`);
      // TikTok limita ad_text (~100 chars): el caption corto va mejor
      const adText = String(copy.tiktokCaption || message).slice(0, 100);
      const { adId } = await createAd(creds, {
        adgroupId,
        adName: `EstudioCreativo ${jobId}`,
        adText,
        videoId,
        callToAction: "LEARN_MORE",
        landingPageUrl: link,
      });
      // Dejarlo EN PAUSA (createAd lo deja según el adgroup; lo forzamos)
      await updateAdStatus(creds, adId, "DISABLE").catch(() => {});

      await jobRef.update({
        publishedTikTok: { adId, at: new Date().toISOString() },
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true, adId, videoId });
    }

    return NextResponse.json({ error: `Acción desconocida: ${action}` }, { status: 400 });
  } catch (err) {
    console.error("[creative/publish]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error publicando." },
      { status: 500 }
    );
  }
}
