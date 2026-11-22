/**
 * Pure helpers that turn untrusted content into fenced prompt blocks.
 * No server APIs, so they can be unit tested.
 */
import type { NormalizedSegment } from "@/utils/parsers";
import { sanitizeMetadataField, sanitizeUntrustedText } from "./safety";

export interface AnalysisContext {
  title?: string | null;
  creatorName?: string | null;
  durationSeconds?: number | null;
}

/** Transcripts below this many characters are too thin to analyse alone. */
export const MIN_TRANSCRIPT_CHARS = 400;
/** ~100k tokens. A 2-hour conversation is usually 100-150k characters. */
const MAX_TRANSCRIPT_CHARS = 400_000;

export function metadataBlock(ctx: AnalysisContext): string {
  const lines = [
    ctx.title ? `title: ${sanitizeMetadataField(ctx.title)}` : null,
    ctx.creatorName ? `channel: ${sanitizeMetadataField(ctx.creatorName, 120)}` : null,
    ctx.durationSeconds ? `duration_seconds: ${Math.round(ctx.durationSeconds)}` : null,
  ].filter(Boolean);
  return lines.length ? `<video_metadata>\n${lines.join("\n")}\n</video_metadata>` : "";
}

/**
 * Compact transcript: captions merged into ~20 second blocks, each with one
 * timestamp. Per-caption timestamps cost ~3 tokens each (thousands per video)
 * and exact times are recovered from the transcript during verification.
 */
export function formatTranscriptForPrompt(segments: NormalizedSegment[]): string {
  const blocks: string[] = [];
  let current: string[] = [];
  let blockStart = 0;
  let chars = 0;
  for (const seg of segments) {
    const text = (seg.text ?? "").trim();
    if (!text) continue;
    if (current.length === 0) blockStart = seg.start ?? 0;
    current.push(seg.speaker ? `${seg.speaker}: ${text}` : text);
    chars += text.length;
    if ((seg.end ?? seg.start ?? 0) - blockStart >= 20 || chars >= 600) {
      blocks.push(`[${Math.round(blockStart)}s] ${current.join(" ")}`);
      current = [];
      chars = 0;
    }
  }
  if (current.length) blocks.push(`[${Math.round(blockStart)}s] ${current.join(" ")}`);
  return sanitizeUntrustedText(blocks.join("\n"), MAX_TRANSCRIPT_CHARS);
}

export function transcriptCharCount(segments: NormalizedSegment[]): number {
  return segments.reduce((n, s) => n + (s.text?.length ?? 0), 0);
}
