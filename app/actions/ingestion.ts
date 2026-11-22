"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { acquireAndStoreTranscript } from "@/utils/transcript/store";
import { preflightSource } from "@/app/actions/preflight";
import { consumeRateLimit } from "@/utils/rate-limit";
import { ensureProfile } from "@/utils/auth/profile";
import { track } from "@/utils/analytics/track";
import { debugRun } from "@/utils/debug";

/**
 * Creates a source for a YouTube link.
 *
 * Only the URL comes from the client. The server re-runs preflightSource()
 * itself (URL parsing, video availability, the duration limit, duplicate
 * check) and stores only what that returns, so calling this action directly
 * can't skip the 2-hour limit. The row is written with the service role:
 * users can't insert or edit sources through the API (20261121 migration),
 * so nobody can point a source at a 10-hour video after preflight.
 */
export async function ingestYouTubeVideo(
  url: string
): Promise<{ success: boolean; sourceId?: string; error?: string; errorType?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return { success: false, errorType: "AUTH_REQUIRED", error: "Create an account to make quote images." };
  }

  if (typeof url !== "string" || url.length > 2048) {
    return { success: false, error: "That link does not look right." };
  }

  const log = debugRun("ingest", user.id);
  // Server-side checks, independent of anything the browser sent.
  const checked = await preflightSource(url);
  log("preflight", { valid: checked.isValid, video: checked.externalId, duration: checked.durationSeconds, next: checked.nextAction, error: checked.errorMessage });
  if (checked.nextAction === "view_existing" && checked.existingSourceId) {
    return { success: true, sourceId: checked.existingSourceId };
  }
  if (!checked.isValid || !checked.externalId) {
    return { success: false, error: checked.errorMessage || "This video cannot be used." };
  }

  // Accounts whose profile row was never created (the old sign-up flows
  // could fail silently) can't own sources. Repair it here instead of failing.
  if (!(await ensureProfile(user))) {
    return { success: false, error: "We couldn't set up your account. Please sign out, sign in again and retry." };
  }

  let writer;
  try {
    writer = createAdminClient();
  } catch {
    console.error("[ingest] SUPABASE_SERVICE_ROLE_KEY is not configured");
    return { success: false, error: "Verbatim is not fully configured. Please contact support." };
  }

  // Idempotency: the same video for the same user returns the existing source.
  const { data: existing } = await writer
    .from("sources")
    .select("id")
    .eq("user_id", user.id)
    .eq("external_id", checked.externalId)
    .maybeSingle();
  if (existing) {
    return { success: true, sourceId: existing.id };
  }

  // Daily limit. Counted in rate_limit_events, which users cannot read or
  // delete, so removing videos no longer resets it.
  const limit = await consumeRateLimit(supabase, "source_create");
  if (!limit.ok) {
    return { success: false, errorType: "RATE_LIMITED", error: limit.error };
  }

  // Store the canonical URL, not whatever variant the user pasted.
  const canonicalUrl = `https://www.youtube.com/watch?v=${checked.externalId}`;

  const { data: source, error: sourceError } = await writer
    .from("sources")
    .insert({
      title: (checked.title || "Untitled video").slice(0, 500),
      source_type: "youtube",
      source_url: canonicalUrl,
      user_id: user.id,
      external_id: checked.externalId,
      creator_name: checked.creatorName?.slice(0, 200) || null,
      duration_seconds: checked.durationSeconds ?? null,
      categories: (checked.categories || []).slice(0, 3),
      content_safety: "SAFE",
    })
    .select("id")
    .single();

  if (sourceError || !source) {
    console.error("[ingest] source insert failed:", sourceError?.message);
    return { success: false, error: "Failed to create source record." };
  }

  // Transcript acquisition is optional enrichment and never blocks analysis.
  // With it, analysis is far cheaper (text instead of video) and quotes can
  // be verified word for word. Cached per video across users.
  log("source created", { sourceId: source.id });
  const transcript = await acquireAndStoreTranscript(source.id, canonicalUrl, { externalId: checked.externalId });
  log("transcript", transcript.stored ? { stored: true, fromCache: transcript.fromCache, segments: transcript.segments.length } : { stored: false, code: transcript.code, reason: transcript.reason });

  track(user.id, "source_added", {
    source_id: source.id,
    external_id: checked.externalId,
    duration_seconds: checked.durationSeconds ?? null,
  });
  track(
    user.id,
    transcript.stored ? "transcript_fetched" : "transcript_unavailable",
    transcript.stored
      ? { source_id: source.id, from_cache: transcript.fromCache, segments: transcript.segments.length, provider_calls: transcript.providerCalls }
      : { source_id: source.id, code: transcript.code, provider_calls: transcript.providerCalls }
  );

  return { success: true, sourceId: source.id };
}
