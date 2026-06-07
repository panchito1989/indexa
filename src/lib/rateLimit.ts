/**
 * Simple in-memory rate limiter for Next.js API routes.
 * Uses a sliding window counter per IP address.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });
 *   // In your route handler:
 *   const ip = request.headers.get("x-forwarded-for") || "unknown";
 *   if (!limiter.check(ip)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 */

interface RateLimiterOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
}

interface Entry {
  count: number;
  resetAt: number;
}

export function createRateLimiter(opts: RateLimiterOptions) {
  const store = new Map<string, Entry>();

  // Cleanup stale entries every 60s to prevent memory leaks
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 60_000).unref?.();

  return {
    /**
     * Returns true if the request is allowed, false if rate-limited.
     */
    check(key: string): boolean {
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + opts.windowMs });
        return true;
      }

      entry.count++;
      if (entry.count > opts.max) {
        return false;
      }
      return true;
    },

    /** Returns remaining requests for the key */
    remaining(key: string): number {
      const entry = store.get(key);
      if (!entry || Date.now() > entry.resetAt) return opts.max;
      return Math.max(0, opts.max - entry.count);
    },
  };
}

// ── Distributed rate limit (Vercel KV / Upstash Redis REST) ──────────────────
// Cross-instance limit for expensive/abusable endpoints. Uses Vercel KV when
// KV_REST_API_URL + KV_REST_API_TOKEN are set; otherwise falls back to a
// per-instance in-memory counter. FAIL-OPEN: any backend error allows the
// request, so a KV outage never locks out legitimate users.
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const memStore = new Map<string, Entry>();
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of memStore) if (now > e.resetAt) memStore.delete(k);
}, 60_000).unref?.();

function memAllow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const e = memStore.get(key);
  if (!e || now > e.resetAt) { memStore.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  e.count++;
  return e.count <= max;
}

async function kvCmd(path: string): Promise<number | null> {
  try {
    const res = await fetch(`${KV_URL}${path}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: number };
    return typeof data.result === "number" ? data.result : null;
  } catch {
    return null;
  }
}

/**
 * Distributed, cross-instance rate limit. Returns true if allowed, false if over limit.
 * Fixed window of `windowSec` seconds, `max` requests per `key`.
 *
 *   if (!(await checkRateLimit(`ai:${uid}`, 12, 60))) return 429;
 */
export async function checkRateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  if (KV_URL && KV_TOKEN) {
    const k = `rl:${encodeURIComponent(key)}`;
    const count = await kvCmd(`/incr/${k}`);
    if (count === null) return true; // fail-open: KV unavailable
    if (count === 1) await kvCmd(`/expire/${k}/${windowSec}`); // start the window on first hit
    return count <= max;
  }
  return memAllow(key, max, windowSec * 1000);
}
