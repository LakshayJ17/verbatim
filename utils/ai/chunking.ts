import { NormalizedSegment } from "../parsers";

export interface TranscriptChunk {
  index: number;
  segments: NormalizedSegment[];
  text: string;
  startSeconds: number;
  endSeconds: number;
  tokenEstimate: number;
}

// Heuristic: 1 token is roughly 4 characters in English
const CHARS_PER_TOKEN = 4;
// We aim for chunks of about 8000 tokens (approx 32k chars)
// This fits comfortably in modern LLM contexts while allowing dense extraction
const TARGET_CHUNK_TOKENS = 8000;
// We overlap by about 500 tokens (approx 2000 chars) to prevent cutting context
const OVERLAP_TOKENS = 500;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Chunks a normalized transcript into manageable pieces with overlap.
 * It preserves exact segment boundaries (never splits a single segment).
 */
export function chunkTranscript(segments: NormalizedSegment[]): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let currentSegments: NormalizedSegment[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const segmentTokens = estimateTokens(segment.text);

    currentSegments.push(segment);
    currentTokens += segmentTokens;

    if (currentTokens >= TARGET_CHUNK_TOKENS || i === segments.length - 1) {
      // Finalize chunk
      chunks.push({
        index: chunkIndex++,
        segments: [...currentSegments],
        text: currentSegments.map(s => `[${s.start ?? 0}] ${s.speaker ? s.speaker + ': ' : ''}${s.text}`).join('\n'),
        startSeconds: currentSegments[0].start ?? 0,
        endSeconds: currentSegments[currentSegments.length - 1].end ?? currentSegments[currentSegments.length - 1].start ?? 0,
        tokenEstimate: currentTokens,
      });

      // Start new chunk with overlap
      // Backtrack to find overlap
      let overlapTokens = 0;
      const nextSegments: NormalizedSegment[] = [];
      for (let j = currentSegments.length - 1; j >= 0; j--) {
        const backSegment = currentSegments[j];
        const backTokens = estimateTokens(backSegment.text);
        if (overlapTokens + backTokens > OVERLAP_TOKENS) {
          break;
        }
        nextSegments.unshift(backSegment);
        overlapTokens += backTokens;
      }

      currentSegments = [...nextSegments];
      currentTokens = overlapTokens;
    }
  }

  return chunks;
}
