import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { CallUsage } from "@/utils/ai/provider";

/**
 * Product usage tracking (who gets value from Verbatim, and what it costs).
 *
 * Rows go to public.usage_events and public.ai_usage (20261121 migration)
 * with the service role. Users have no access to either table. Tracking is
 * best effort: it never throws and never blocks the user's action, and if
 * the migration has not been applied it logs once and does nothing.
 */

export const PRODUCT_EVENTS = [
  // Activation
  "signed_up",
  "source_added",
  "transcript_fetched",
  "transcript_unavailable",
  // Core value
  "analysis_started",
  "analysis_completed",
  "analysis_failed",
  "design_saved",
  "image_downloaded",
  "image_shared",
  "caption_copied",
  // Distribution
  "post_published",
  "post_unpublished",
  // Engagement
  "comment_added",
  "post_liked",
  "post_bookmarked",
  "user_followed",
] as const;

export type ProductEvent = (typeof PRODUCT_EVENTS)[number];

let warnedMissing = false;
function isMissingTable(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205" || code === "PGRST202";
}
function logOnce(where: string, message: string, code?: string) {
  if (isMissingTable(code)) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(`[analytics] ${where}: tracking tables missing. Apply supabase/migrations/20261121120000_usage_cost_and_hardening.sql.`);
    }
    return;
  }
  console.error(`[analytics] ${where} failed:`, message);
}

function admin() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

/** Keeps properties small and JSON-safe. */
function cleanProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props).slice(0, 30)) {
    if (v === undefined) continue;
    if (typeof v === "string") out[k] = v.slice(0, 300);
    else if (typeof v === "number") out[k] = Number.isFinite(v) ? v : null;
    else if (typeof v === "boolean" || v === null) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 20).map((x) => (typeof x === "string" ? x.slice(0, 100) : x));
    else {
      const json = JSON.stringify(v) ?? "null";
      out[k] = json.length <= 2000 ? JSON.parse(json) : "[truncated]";
    }
  }
  return out;
}

export async function trackEvent(
  userId: string | null,
  event: ProductEvent,
  properties: Record<string, unknown> = {}
): Promise<void> {
  const db = admin();
  if (!db) return;
  try {
    const { error } = await db.from("usage_events").insert({
      user_id: userId,
      event,
      properties: cleanProps(properties),
    });
    if (error) logOnce("trackEvent", error.message, error.code);
  } catch (e) {
    console.error("[analytics] trackEvent threw:", e instanceof Error ? e.message : e);
  }
}

/**
 * Schedules trackEvent to run after the response is sent (Next.js after()),
 * so analytics never slows the user down and isn't dropped when a serverless
 * function freezes. Falls back to a detached call outside a request scope.
 */
export function track(userId: string | null, event: ProductEvent, properties: Record<string, unknown> = {}): void {
  try {
    after(() => trackEvent(userId, event, properties));
  } catch {
    void trackEvent(userId, event, properties);
  }
}

export interface AIUsageRow {
  userId: string;
  sourceId: string;
  analysisId: string | null;
  usage: CallUsage | null;
  /** Mode actually used, or attempted when the call failed before usage data. */
  mode: "transcript" | "video";
  model: string;
  status: "success" | "error" | "cache_hit";
  errorCode?: string;
  injectionFlags?: string[];
  transcriptCalls?: number;
  transcriptCostUsd?: number;
}

export async function recordAIUsage(row: AIUsageRow): Promise<void> {
  const db = admin();
  if (!db) return;
  const u = row.usage;
  try {
    const { error } = await db.from("ai_usage").insert({
      user_id: row.userId,
      source_id: row.sourceId,
      analysis_id: row.analysisId,
      provider: "gemini",
      model: u?.model ?? row.model,
      mode: u?.mode ?? row.mode,
      status: row.status,
      error_code: row.errorCode ?? null,
      prompt_tokens: u?.promptTokens ?? 0,
      audio_prompt_tokens: u?.audioPromptTokens ?? 0,
      cached_tokens: u?.cachedTokens ?? 0,
      output_tokens: u?.outputTokens ?? 0,
      thoughts_tokens: u?.thoughtsTokens ?? 0,
      total_tokens: u?.totalTokens ?? 0,
      estimated_cost_usd: (u?.costUsd ?? 0) + (row.transcriptCostUsd ?? 0),
      duration_ms: u?.durationMs ?? null,
      finish_reason: u?.finishReason ?? null,
      transcript_calls: row.transcriptCalls ?? 0,
      injection_flags: row.injectionFlags ?? [],
    });
    if (error) logOnce("recordAIUsage", error.message, error.code);
  } catch (e) {
    console.error("[analytics] recordAIUsage threw:", e instanceof Error ? e.message : e);
  }
}

function envUsd(name: string): number | null {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function startOfUtcDay(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function spendSince(sinceIso: string, userId?: string): Promise<number | null> {
  const db = admin();
  if (!db) return null;
  const { data, error } = await db.rpc("ai_spend_since", { p_since: sinceIso, p_user: userId ?? null });
  if (error) {
    logOnce("ai_spend_since", error.message, error.code);
    return null;
  }
  return Number(data ?? 0);
}

/**
 * Spend guard. AI_DAILY_BUDGET_USD caps total estimated AI spend per UTC day
 * (fails closed once reached); AI_USER_DAILY_BUDGET_USD caps one user.
 * Unset = no cap. If spend can't be read the request is allowed, so a
 * tracking outage never takes analysis down.
 */
export async function checkAIBudget(userId: string): Promise<{ ok: true } | { ok: false; error: string; scope: "global" | "user" }> {
  const globalCap = envUsd("AI_DAILY_BUDGET_USD");
  const userCap = envUsd("AI_USER_DAILY_BUDGET_USD");
  if (!globalCap && !userCap) return { ok: true };
  const since = startOfUtcDay();

  const [globalSpend, userSpend] = await Promise.all([
    globalCap ? spendSince(since) : Promise.resolve(null),
    userCap ? spendSince(since, userId) : Promise.resolve(null),
  ]);

  if (globalCap && globalSpend !== null && globalSpend >= globalCap) {
    console.warn(`[budget] global daily AI budget reached: $${globalSpend.toFixed(4)} >= $${globalCap}`);
    return { ok: false, scope: "global", error: "Verbatim has reached today's analysis capacity. Please try again tomorrow." };
  }
  if (userCap && userSpend !== null && userSpend >= userCap) {
    return { ok: false, scope: "user", error: "You have reached today's analysis limit. Please try again tomorrow." };
  }
  return { ok: true };
}
