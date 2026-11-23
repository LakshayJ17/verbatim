import "server-only";
import type { NormalizedSegment } from "@/utils/parsers";
import { createAdminClient } from "@/utils/supabase/admin";
import { sanitizeUntrustedText } from "@/utils/ai/safety";
import { getTranscriptProvider } from "./index";
import { TranscriptProviderError } from "./provider";

export type TranscriptAcquisition =
  | { stored: true; segments: NormalizedSegment[]; fromCache: boolean; providerCalls: number }
  | { stored: false; reason: string; code: string; providerCalls: number };

/**
 * Captions are written by the video's uploader, so they are untrusted:
 * invisible and control characters (used to hide prompt injections) are
 * removed before anything is stored or sent to the model.
 */
export function sanitizeSegments(segments: NormalizedSegment[]): NormalizedSegment[] {
  const out: NormalizedSegment[] = [];
  for (const s of segments.slice(0, 20_000)) {
    const start = typeof s.start === "number" && Number.isFinite(s.start) ? s.start : 0;
    const end = typeof s.end === "number" && Number.isFinite(s.end) ? s.end : s.start ?? 0;
    const speaker = s.speaker ? { speaker: sanitizeUntrustedText(s.speaker, 80) } : {};
    // Long segments are split, not cut: a plain-text transcript arrives as one
    // segment, and cutting it at 2,000 characters lost all but the first minute.
    for (const piece of splitLongText(s.text ?? "", SEGMENT_MAX_CHARS)) {
      const text = sanitizeUntrustedText(piece, SEGMENT_MAX_CHARS);
      if (!text) continue;
      out.push({ start, end, text, ...speaker });
      if (out.length >= 20_000) return out;
    }
  }
  return out;
}

const SEGMENT_MAX_CHARS = 2_000;

/** Splits text into pieces of at most `max` characters, at spaces where possible. */
export function splitLongText(text: string, max: number): string[] {
  const pieces: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const cut = rest.lastIndexOf(" ", max);
    const at = cut > max * 0.5 ? cut : max;
    pieces.push(rest.slice(0, at));
    rest = rest.slice(at).trimStart();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/** Reads normalized_segments whether it was stored as a JSON array or (legacy) a JSON string. */
export function readSegments(value: unknown): NormalizedSegment[] | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as NormalizedSegment[]) : null;
  } catch {
    return null;
  }
}

const TRANSCRIPT_CACHE_DAYS = Number.parseInt(process.env.TRANSCRIPT_CACHE_DAYS ?? "", 10) || 30;

/**
 * Fetches a YouTube transcript and stores it for `sourceId`.
 *
 * Cost: transcripts are cached per video (public.transcript_cache), so a
 * video one user already added costs nothing for the next user.
 *
 * Integrity: transcripts are written with the service role only. Users can't
 * insert or edit them (20261121 migration), because quote verification
 * trusts them: a user-written transcript could make an invented quote
 * "verified".
 *
 * Never throws: a transcript is optional enrichment; failures are logged and
 * returned so callers can decide what to do.
 */
export async function acquireAndStoreTranscript(
  sourceId: string,
  videoUrl: string,
  opts: { externalId?: string | null } = {}
): Promise<TranscriptAcquisition> {
  let writer;
  try {
    writer = createAdminClient();
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Service role not configured";
    console.error(`[transcript] ${reason}`);
    return { stored: false, reason, code: "CONFIG", providerCalls: 0 };
  }

  let segments: NormalizedSegment[] | null = null;
  let language: string | undefined;
  let fromCache = false;
  let providerCalls = 0;

  // 1. Shared cache by video id.
  if (opts.externalId) {
    const since = new Date(Date.now() - TRANSCRIPT_CACHE_DAYS * 86_400_000).toISOString();
    const { data: cached, error } = await writer
      .from("transcript_cache")
      .select("segments, language")
      .eq("external_id", opts.externalId)
      .gte("created_at", since)
      .maybeSingle();
    if (error && error.code !== "42P01" && error.code !== "PGRST205") {
      console.warn("[transcript] cache read failed:", error.message);
    }
    const cachedSegments = readSegments(cached?.segments);
    if (cachedSegments) {
      segments = cachedSegments;
      language = cached?.language ?? undefined;
      fromCache = true;
    }
  }

  // 2. Provider.
  if (!segments) {
    try {
      providerCalls = 1;
      const provider = getTranscriptProvider();
      const result = await provider.getTranscript(videoUrl);
      segments = sanitizeSegments(result.segments);
      language = result.language;
    } catch (error: unknown) {
      const code = error instanceof TranscriptProviderError ? error.code : "CONFIG";
      const message = error instanceof Error ? error.message : "Unknown error";
      console.warn(`[transcript] Unavailable for source ${sourceId} (${code}): ${message}`);
      return { stored: false, reason: message, code, providerCalls };
    }
  }

  if (segments.length === 0) {
    console.warn(`[transcript] Provider returned no segments for source ${sourceId}`);
    return { stored: false, reason: "No transcript segments returned.", code: "NOT_FOUND", providerCalls };
  }

  const { error: insertError } = await writer.from("transcripts").insert({
    source_id: sourceId,
    text: segments.map((s) => s.text).join("\n"),
    language: language || "en",
    // Stored as a real JSON array (it used to be a JSON-encoded string).
    normalized_segments: segments,
  });

  if (insertError) {
    console.warn(`[transcript] Failed to save transcript for source ${sourceId}: ${insertError.message}`);
    return { stored: false, reason: "Failed to save transcript.", code: "DB", providerCalls };
  }

  if (!fromCache && opts.externalId) {
    const { error } = await writer
      .from("transcript_cache")
      .upsert({ external_id: opts.externalId, language: language || "en", segments, created_at: new Date().toISOString() });
    if (error && error.code !== "42P01" && error.code !== "PGRST205") {
      console.warn("[transcript] cache write failed:", error.message);
    }
  }

  return { stored: true, segments, fromCache, providerCalls };
}
