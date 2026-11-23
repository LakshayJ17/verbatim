"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  AIProviderError,
  getAIProvider,
  getConfiguredModel,
  MIN_TRANSCRIPT_CHARS,
  PROMPT_VERSION,
  transcriptCharCount,
  type AnalysisMode,
  type CallUsage,
} from "@/utils/ai/provider";
import type { AnalysisResult } from "@/utils/ai/schema";
import { AnalysisResultSchema } from "@/utils/ai/schema";
import { verifyQuotes, markAsSourceDerived, countByStatus, type VerifiedQuote } from "@/utils/ai/verification";
import { detectInjectionSignals, sanitizeAnalysisOutput } from "@/utils/ai/safety";
import { estimateCostUsd, transcriptCallCostUsd } from "@/utils/ai/pricing";
import type { NormalizedSegment } from "@/utils/parsers";
import { acquireAndStoreTranscript, readSegments } from "@/utils/transcript/store";
import { consumeRateLimit } from "@/utils/rate-limit";
import { checkAIBudget, recordAIUsage, track } from "@/utils/analytics/track";
import { asArray, isStaleProcessing, pickAnalysis } from "@/utils/analysis/pick";
import { parseYouTubeUrl } from "@/utils/source/normalization";
import { debugRun } from "@/utils/debug";

const MAX_CONTENT_DURATION_SECONDS = Number.parseInt(process.env.MAX_CONTENT_DURATION_SECONDS || "7200", 10);
/** Whole action budget; the pages that call this export maxDuration = 300. */
const ACTION_BUDGET_MS = 285_000;
/** Analyses running at once across everyone (passed to claim_analysis). */
const MAX_CONCURRENT_ANALYSES = Math.max(1, Number.parseInt(process.env.AI_MAX_CONCURRENT_ANALYSES || "5", 10) || 5);
/** Rough Gemini input rate for a video at low resolution: frames plus audio, per second. */
const VIDEO_TOKENS_PER_SECOND = { frames: 66, audio: 32 };
/** How long a late transcript fetch may hold up the analysis. */
const LATE_TRANSCRIPT_WAIT_MS = 45_000;
const CACHE_TTL_DAYS = Number.parseInt(process.env.AI_CACHE_TTL_DAYS ?? "30", 10);

type Writer = SupabaseClient;

export type AnalyzeResult = { success: true; analysisId: string } | { error: string };

// ---------------------------------------------------------------------------
// Claiming the run (one analysis per source, one run at a time)
// ---------------------------------------------------------------------------

type Claim = { analysisId: string } | { busy: true } | { error: string };

/**
 * Atomically creates or re-opens the source's analysis as "processing".
 * claim_analysis() (20261121 migration) takes an advisory lock, so two clicks
 * or two tabs can no longer create two analyses or run twice. Falls back to
 * the non-atomic path if the migration hasn't been applied yet.
 */
async function claimAnalysis(
  supabase: Awaited<ReturnType<typeof createClient>>,
  writer: Writer,
  sourceId: string,
  existing: { id: string; status: string } | undefined
): Promise<Claim> {
  let { data, error } = await supabase.rpc("claim_analysis", {
    p_source_id: sourceId,
    p_stale_seconds: 600,
    p_max_running: MAX_CONCURRENT_ANALYSES,
  });
  // Before the 20261123100000 migration the function has no p_max_running.
  if (error?.code === "PGRST202") {
    ({ data, error } = await supabase.rpc("claim_analysis", { p_source_id: sourceId, p_stale_seconds: 600 }));
  }
  if (!error) {
    return data ? { analysisId: data as string } : { busy: true };
  }
  // One run per account at a time, and a cap across everyone, so parallel
  // runs can't all slip under the daily spending cap (20261123100000 migration).
  if (error.message?.includes("ANALYSIS_IN_PROGRESS")) {
    return { error: "Another of your videos is being analyzed. Try this one when it finishes." };
  }
  if (error.message?.includes("ANALYSIS_BUSY")) {
    return { error: "Verbatim is analyzing a lot of videos right now. Please try again in a few minutes." };
  }
  if (error.code !== "PGRST202" && error.code !== "42883") {
    console.error("[analysis] claim_analysis failed:", error.message);
    return { error: "Could not start the analysis. Please try again." };
  }

  // Fallback (migration not applied).
  if (existing?.id) {
    const { error: updateError } = await writer
      .from("analyses")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return updateError ? { error: "Failed to initialize analysis." } : { analysisId: existing.id };
  }
  const { data: created, error: insertError } = await writer
    .from("analyses")
    .insert({ source_id: sourceId, status: "processing" })
    .select("id")
    .single();
  return insertError || !created ? { error: "Failed to initialize analysis." } : { analysisId: created.id as string };
}

// ---------------------------------------------------------------------------
// Result cache (same video analysed by another user = no second AI call)
// ---------------------------------------------------------------------------

async function readCachedResult(writer: Writer, externalId: string | null, mode: AnalysisMode, model: string): Promise<AnalysisResult | null> {
  if (!externalId || CACHE_TTL_DAYS <= 0) return null;
  const since = new Date(Date.now() - CACHE_TTL_DAYS * 86_400_000).toISOString();
  const { data, error } = await writer
    .from("analysis_cache")
    .select("result")
    .eq("external_id", externalId)
    .eq("mode", mode)
    .eq("model", model)
    .eq("prompt_version", PROMPT_VERSION)
    .gte("created_at", since)
    .maybeSingle();
  if (error) {
    if (error.code !== "42P01" && error.code !== "PGRST205") console.warn("[analysis] cache read failed:", error.message);
    return null;
  }
  if (!data?.result) return null;
  const parsed = AnalysisResultSchema.safeParse(data.result);
  return parsed.success ? sanitizeAnalysisOutput(parsed.data) : null;
}

async function writeCachedResult(writer: Writer, externalId: string | null, mode: AnalysisMode, model: string, result: AnalysisResult) {
  if (!externalId || CACHE_TTL_DAYS <= 0) return;
  const { error } = await writer.from("analysis_cache").upsert(
    {
      external_id: externalId,
      mode,
      model,
      prompt_version: PROMPT_VERSION,
      result,
      created_at: new Date().toISOString(),
    },
    { onConflict: "external_id,mode,model,prompt_version" }
  );
  if (error && error.code !== "42P01" && error.code !== "PGRST205") console.warn("[analysis] cache write failed:", error.message);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Saves quotes and insights, then marks the analysis completed. Uses the
 * service role: users have no INSERT policy on quotes/insights, so nobody can
 * write a quote that claims to be 'verified'. Rows from an earlier failed
 * attempt are removed first, so a retry no longer duplicates them.
 */
async function persistAnalysisResult(
  writer: Writer,
  analysisId: string,
  userId: string,
  result: AnalysisResult,
  quotes: VerifiedQuote[]
) {
  for (const table of ["quotes", "insights"] as const) {
    const { error } = await writer.from(table).delete().eq("analysis_id", analysisId);
    if (error) {
      console.error(`[analysis] clearing old ${table} failed:`, error.message);
      throw new Error("Could not save this analysis. Please try again.");
    }
  }

  if (result.insights.length > 0) {
    const { error } = await writer.from("insights").insert(
      result.insights.map((i) => ({
        analysis_id: analysisId,
        user_id: userId,
        title: i.title,
        summary: i.explanation,
        category: i.category,
        importance_score: i.importanceScore,
      }))
    );
    if (error) {
      console.error("[analysis] insights insert failed:", error.message);
      throw new Error("Could not save the insights for this analysis.");
    }
  }

  if (quotes.length > 0) {
    const { error } = await writer.from("quotes").insert(
      quotes.map((q) => ({
        analysis_id: analysisId,
        user_id: userId,
        text: q.text,
        speaker_name: q.speaker ?? null,
        start_seconds: q.startTimestamp ?? null,
        end_seconds: q.endTimestamp ?? null,
        why_it_matters: q.whyItMatters,
        confidence: q.confidence,
        verification_status: q.verificationStatus,
      }))
    );
    if (error) {
      console.error("[analysis] quotes insert failed:", error.message);
      throw new Error("Could not save the quotes for this analysis.");
    }
  }

  const { error: updateError } = await writer
    .from("analyses")
    .update({
      status: "completed",
      summary: result.summary,
      topics: result.topics,
      important_moments: result.importantMoments,
      caption_suggestions: result.captionSuggestions,
      updated_at: new Date().toISOString(),
    })
    .eq("id", analysisId);

  if (updateError) {
    console.error("[analysis] status update failed:", updateError.message);
    throw new Error("Could not save this analysis. Please try again.");
  }
}

/**
 * AI_ANALYSIS_MODE: "auto" (default) analyses the transcript as text when
 * there is a usable one and watches the video only when there isn't; "video"
 * always watches the video (much more expensive); "transcript" is the same as
 * auto.
 */
function chooseMode(segments: NormalizedSegment[] | null): AnalysisMode {
  const configured = (process.env.AI_ANALYSIS_MODE ?? "auto").toLowerCase();
  if (configured === "video") return "video";
  return segments && transcriptCharCount(segments) >= MIN_TRANSCRIPT_CHARS ? "transcript" : "video";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

/**
 * Analyzes a YouTube source. Uses the stored transcript as text when there is
 * one (cheap, and quotes can be verified word for word); otherwise Gemini
 * watches the video and quotes are marked source_derived.
 */
export async function analyzeYouTubeSource(sourceId: string): Promise<AnalyzeResult> {
  const startedAt = Date.now();
  const log = debugRun("analysis", sourceId);
  if (!z.uuid().safeParse(sourceId).success) return { error: "Source not found or access denied." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return { error: "Unauthorized. Guests cannot run AI analysis." };
  }

  // 1. Ownership (with the user's own session) and current state.
  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select(
      "id, user_id, source_url, external_id, title, creator_name, duration_seconds, transcripts(id, normalized_segments), analyses(id, status, updated_at, created_at)"
    )
    .eq("id", sourceId)
    .maybeSingle();

  if (sourceError || !source || source.user_id !== user.id) {
    return { error: "Source not found or access denied." };
  }
  if (!source.source_url) {
    return { error: "Source URL not found. Cannot analyze without a YouTube URL." };
  }

  // Defence in depth: the URL must still be the YouTube video that passed
  // preflight, and within the length limit, before anything is spent on it.
  const parsedUrl = parseYouTubeUrl(source.source_url);
  // A missing video id or length is refused rather than trusted: the id keys
  // the shared caches, and the length is what keeps cost bounded.
  if (parsedUrl.type !== "video" || !parsedUrl.id || !source.external_id || parsedUrl.id !== source.external_id) {
    return { error: "This source's link is not a supported YouTube video." };
  }
  if (typeof source.duration_seconds !== "number" || source.duration_seconds <= 0) {
    return { error: "We couldn't confirm this video's length. Please add it again." };
  }
  if (source.duration_seconds > MAX_CONTENT_DURATION_SECONDS) {
    return { error: "This video is longer than Verbatim supports." };
  }

  log("loaded source", { duration: source.duration_seconds, transcripts: asArray(source.transcripts).length, analyses: asArray(source.analyses).length });
  const existing = pickAnalysis(source.analyses as Array<{ id: string; status: string; updated_at: string; created_at: string }>);
  if (existing?.status === "completed") {
    return { success: true, analysisId: existing.id };
  }
  if (existing?.status === "processing" && !isStaleProcessing(existing)) {
    return { error: "This video is already being analyzed. It will appear here when it's ready." };
  }

  let writer: Writer;
  try {
    writer = createAdminClient();
  } catch {
    console.error("[analysis] SUPABASE_SERVICE_ROLE_KEY is not configured");
    return { error: "Analysis is not configured on this server. Please contact support." };
  }

  // 2. Spend guards: global/user daily budget, then the per-user daily limit.
  const budget = await checkAIBudget(user.id);
  if (!budget.ok) {
    log("refused: budget", { scope: budget.scope });
    return { error: budget.error };
  }

  const limit = await consumeRateLimit(supabase, "analysis_run");
  if (!limit.ok) {
    log("refused: rate limit");
    return { error: limit.error };
  }

  // 3. Claim the run.
  const claim = await claimAnalysis(supabase, writer, sourceId, existing);
  if ("error" in claim) return { error: claim.error };
  if ("busy" in claim) return { error: "This video is already being analyzed. It will appear here when it's ready." };
  const analysisId = claim.analysisId;
  log("claimed", { analysisId });

  const model = getConfiguredModel();
  let mode: AnalysisMode = "video";
  let usage: CallUsage | null = null;
  let transcriptCalls = 0;
  let injectionFlags: string[] = [];

  try {
    // 4. Transcript: the stored one, or one more try if ingest didn't get it.
    const stored = asArray(source.transcripts as Array<{ normalized_segments: unknown }> | null)
      .map((t) => readSegments(t.normalized_segments))
      .find((s): s is NormalizedSegment[] => Boolean(s));
    let segments: NormalizedSegment[] | null = stored ?? null;
    if (!segments) {
      const late = await withTimeout(
        acquireAndStoreTranscript(sourceId, source.source_url, { externalId: source.external_id }),
        LATE_TRANSCRIPT_WAIT_MS
      );
      if (late) transcriptCalls += late.providerCalls;
      if (late?.stored) segments = late.segments;
    }

    mode = chooseMode(segments);
    log("mode chosen", { mode, segments: segments?.length ?? 0, chars: segments ? transcriptCharCount(segments) : 0, transcriptCalls });
    if (segments) {
      injectionFlags = detectInjectionSignals(segments.map((s) => s.text).join(" "));
    }
    injectionFlags = [...new Set([...injectionFlags, ...detectInjectionSignals(`${source.title ?? ""} ${source.creator_name ?? ""}`)])];
    if (injectionFlags.length) {
      console.warn(`[analysis] possible prompt injection in source ${sourceId}: ${injectionFlags.join(", ")}`);
    }

    track(user.id, "analysis_started", { source_id: sourceId, mode, has_transcript: Boolean(segments) });

    // 5. Result: shared cache first, then the model.
    const ctx = { title: source.title, creatorName: source.creator_name, durationSeconds: source.duration_seconds };
    let result = await readCachedResult(writer, source.external_id, mode, model);
    const cacheHit = Boolean(result);
    log(cacheHit ? "cache hit" : "cache miss", { model, injectionFlags });
    if (!result) {
      const provider = getAIProvider();
      // Never run past the page's maxDuration: the run must be able to mark
      // itself failed instead of being killed and left on "processing".
      const timeoutMs = Math.max(30_000, ACTION_BUDGET_MS - (Date.now() - startedAt) - 10_000);
      const call =
        mode === "transcript" && segments
          ? await provider.analyzeTranscript(segments, ctx, { timeoutMs })
          : await provider.analyzeYouTubeVideo(source.source_url, ctx, { timeoutMs });
      result = call.result;
      usage = call.usage;
      log("model answered", { model: usage.model, ms: usage.durationMs, in: usage.promptTokens, out: usage.outputTokens, thoughts: usage.thoughtsTokens, cost: usage.costUsd, finish: usage.finishReason });
      // Cached before persisting, so a failed save doesn't pay for the model twice.
      await writeCachedResult(writer, source.external_id, mode, model, result);
    }

    // 6. Verification is computed here, never taken from the model.
    const verifiedQuotes = segments ? verifyQuotes(result.quotes, segments) : markAsSourceDerived(result.quotes);

    // 7. Persist.
    const counts = countByStatus(verifiedQuotes);
    log("verified", { ...counts, insights: result.insights.length });
    await persistAnalysisResult(writer, analysisId, user.id, result, verifiedQuotes);
    log("saved");
    await recordAIUsage({
      userId: user.id,
      sourceId,
      analysisId,
      usage,
      mode,
      model,
      status: cacheHit ? "cache_hit" : "success",
      injectionFlags,
      transcriptCalls,
      transcriptCostUsd: transcriptCalls * transcriptCallCostUsd(),
    });
    track(user.id, "analysis_completed", {
      source_id: sourceId,
      analysis_id: analysisId,
      mode,
      cache_hit: cacheHit,
      quotes: verifiedQuotes.length,
      verified: counts.verified,
      needs_review: counts.needs_review,
      rejected: counts.rejected,
      source_derived: counts.source_derived,
      insights: result.insights.length,
      cost_usd: usage?.costUsd ?? 0,
      duration_ms: Date.now() - startedAt,
    });

    revalidatePath(`/library/${sourceId}`);
    revalidatePath("/library");
    return { success: true, analysisId };
  } catch (error: unknown) {
    const code = error instanceof AIProviderError ? error.code : "INTERNAL";
    log("failed", { code, message: error instanceof Error ? error.message.slice(0, 300) : String(error) });
    console.error(`[analysis] failed for source ${sourceId} (${code}):`, error instanceof Error ? error.message : error);

    await writer
      .from("analyses")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", analysisId);

    // A video call stopped before Gemini reported usage is still billed for the
    // video it read; record an estimate so the spending caps can see it.
    let failedUsage = error instanceof AIProviderError ? (error.usage ?? null) : usage;
    if (!failedUsage && error instanceof AIProviderError && mode === "video" && typeof source.duration_seconds === "number") {
      const promptTokens = Math.round(source.duration_seconds * (VIDEO_TOKENS_PER_SECOND.frames + VIDEO_TOKENS_PER_SECOND.audio));
      const audioPromptTokens = Math.round(source.duration_seconds * VIDEO_TOKENS_PER_SECOND.audio);
      failedUsage = {
        model,
        mode,
        promptTokens,
        audioPromptTokens,
        cachedTokens: 0,
        outputTokens: 0,
        thoughtsTokens: 0,
        totalTokens: promptTokens,
        costUsd: estimateCostUsd(model, { promptTokens, audioPromptTokens, cachedTokens: 0, outputTokens: 0, thoughtsTokens: 0 }),
        durationMs: Date.now() - startedAt,
        finishReason: "ESTIMATED",
      };
    }
    await recordAIUsage({
      userId: user.id,
      sourceId,
      analysisId,
      usage: failedUsage,
      mode,
      model,
      status: "error",
      errorCode: code,
      injectionFlags,
      transcriptCalls,
      transcriptCostUsd: transcriptCalls * transcriptCallCostUsd(),
    });
    track(user.id, "analysis_failed", { source_id: sourceId, mode, code, duration_ms: Date.now() - startedAt });

    revalidatePath(`/library/${sourceId}`);
    if (error instanceof AIProviderError) return { error: error.userMessage };
    if (Date.now() - startedAt > ACTION_BUDGET_MS) return { error: "The analysis took too long and was stopped. Please try again." };
    return { error: error instanceof Error && error.message.startsWith("Could not") ? error.message : "Something went wrong during analysis. Please try again." };
  }
}
