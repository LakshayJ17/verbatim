import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import type { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Per-user limits. Windows are in seconds. Kept in one place so they are easy to tune. */
export const RATE_LIMITS = {
  // Each new video costs Gemini and Supadata usage, so these fail closed.
  source_create: { limit: 5, window: 86_400, failClosed: true, message: "You have added 5 videos in the last 24 hours. Please try again tomorrow." },
  analysis_run: { limit: 10, window: 86_400, failClosed: true, message: "You have reached today's analysis limit. Please try again tomorrow." },
  // Checking a link calls the YouTube Data API (a shared daily quota).
  preflight: { limit: 60, window: 3_600, failClosed: false, message: "You have checked a lot of links in the last hour. Please wait a little and try again." },
  publish: { limit: 30, window: 3_600, failClosed: false, message: "You are posting a lot right now. Please wait a few minutes." },
  feedback: { limit: 5, window: 3_600, failClosed: false, message: "Thanks, we have your feedback. Please wait a while before sending more." },
  report: { limit: 20, window: 3_600, failClosed: false, message: "You have sent a lot of reports. Please wait a while before sending more." },
  comment: { limit: 10, window: 60, failClosed: false, message: "You are commenting too fast. Please wait a moment." },
  comment_daily: { limit: 200, window: 86_400, failClosed: false, message: "You have reached today's comment limit." },
  like: { limit: 120, window: 60, failClosed: false, message: "Slow down a little and try again." },
  bookmark: { limit: 120, window: 60, failClosed: false, message: "Slow down a little and try again." },
  follow: { limit: 60, window: 60, failClosed: false, message: "Slow down a little and try again." },
  design_save: { limit: 120, window: 3_600, failClosed: false, message: "You have saved a lot of designs in the last hour. Please wait a few minutes." },
  collection_create: { limit: 30, window: 3_600, failClosed: false, message: "You have created a lot of collections in the last hour. Please wait a while." },
  profile_update: { limit: 30, window: 3_600, failClosed: false, message: "You have changed your profile a lot in the last hour. Please wait a while." },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

/**
 * Spends one unit of the signed-in user's quota for `action` via the
 * consume_rate_limit() database function (see the 20261018120000 migration).
 * Returns an error message when the user is over the limit. If the limiter
 * itself fails, expensive actions are refused and cheap ones are allowed.
 */
export async function consumeRateLimit(
  supabase: SupabaseServerClient,
  action: RateLimitAction
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rule = RATE_LIMITS[action];
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_action: action,
    p_limit: rule.limit,
    p_window_seconds: rule.window,
  });

  if (error) {
    console.error(`[rate-limit] ${action} check failed:`, error.message);
    return rule.failClosed
      ? { ok: false, error: "We could not check your usage limit. Please try again in a minute." }
      : { ok: true };
  }
  return data === true ? { ok: true } : { ok: false, error: rule.message };
}

/**
 * Limits for actions that happen before there is an account to count
 * against, keyed on the visitor's network instead. Supabase's own per-IP auth
 * limits see this server's address, not the visitor's, so they can't do this.
 */
export const NETWORK_LIMITS = {
  guest_create: { limit: 5, window: 3_600 },
  signup: { limit: 10, window: 3_600 },
  login: { limit: 20, window: 900 },
  feedback_visitor: { limit: 5, window: 3_600 },
  resend_confirmation: { limit: 5, window: 3_600 },
} as const;

export type NetworkLimitAction = keyof typeof NETWORK_LIMITS;

/** The visitor's IP. Vercel sets these headers itself, so clients can't spoof them there. */
async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

/**
 * Spends one unit of the visitor's network quota for `action`, via the
 * consume_key_rate_limit() database function (service role only). The IP is
 * stored only as a hash. Fails open: a limiter problem must not lock everyone
 * out of signing in.
 */
export async function consumeNetworkLimit(action: NetworkLimitAction): Promise<boolean> {
  const rule = NETWORK_LIMITS[action];
  const key = createHash("sha256").update(`verbatim-net:${await clientIp()}`).digest("hex").slice(0, 40);
  try {
    const { data, error } = await createAdminClient().rpc("consume_key_rate_limit", {
      p_key: key,
      p_action: action,
      p_limit: rule.limit,
      p_window_seconds: rule.window,
    });
    if (error) throw new Error(error.message);
    return data !== false;
  } catch (e) {
    console.error(`[rate-limit] ${action} network check failed:`, e instanceof Error ? e.message : e);
    return true;
  }
}

// Best-effort, per-server-instance limit. Only for low-stakes things such as
// analytics events; anything that costs money or reaches people uses the
// database limiters above.
const memoryHits = new Map<string, number[]>();

export function consumeMemoryLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (memoryHits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    memoryHits.set(key, hits);
    return false;
  }
  hits.push(now);
  memoryHits.set(key, hits);
  if (memoryHits.size > 5_000) memoryHits.clear();
  return true;
}
