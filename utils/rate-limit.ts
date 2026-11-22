import "server-only";
import type { createClient } from "@/utils/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Per-user limits. Windows are in seconds. Kept in one place so they are easy to tune. */
export const RATE_LIMITS = {
  // Each new video costs Gemini and Supadata usage, so these fail closed.
  source_create: { limit: 5, window: 86_400, failClosed: true, message: "You have added 5 videos in the last 24 hours. Please try again tomorrow." },
  analysis_run: { limit: 10, window: 86_400, failClosed: true, message: "You have reached today's analysis limit. Please try again tomorrow." },
  publish: { limit: 30, window: 3_600, failClosed: false, message: "You are posting a lot right now. Please wait a few minutes." },
  feedback: { limit: 5, window: 3_600, failClosed: false, message: "Thanks, we have your feedback. Please wait a while before sending more." },
  report: { limit: 20, window: 3_600, failClosed: false, message: "You have sent a lot of reports. Please wait a while before sending more." },
  comment: { limit: 10, window: 60, failClosed: false, message: "You are commenting too fast. Please wait a moment." },
  comment_daily: { limit: 200, window: 86_400, failClosed: false, message: "You have reached today's comment limit." },
  like: { limit: 120, window: 60, failClosed: false, message: "Slow down a little and try again." },
  bookmark: { limit: 120, window: 60, failClosed: false, message: "Slow down a little and try again." },
  follow: { limit: 60, window: 60, failClosed: false, message: "Slow down a little and try again." },
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

// Best-effort limit for visitors who are not signed in (feedback form only).
// In-memory per server instance; signed-in users use the database limiter.
const anonHits = new Map<string, number[]>();

export function consumeAnonymousLimit(key: string, limit = 5, windowMs = 3_600_000): boolean {
  const now = Date.now();
  const hits = (anonHits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    anonHits.set(key, hits);
    return false;
  }
  hits.push(now);
  anonHits.set(key, hits);
  if (anonHits.size > 5_000) anonHits.clear();
  return true;
}
