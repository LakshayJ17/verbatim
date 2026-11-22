import { TranscriptProvider, TranscriptProviderResult, TranscriptProviderError } from "./provider";
import { NormalizedSegment } from "@/utils/parsers";
import { z } from "zod";

/**
 * Supadata API response schema.
 * 
 * IMPORTANT: Supadata returns `offset` and `duration` in MILLISECONDS.
 * Verbatim's NormalizedSegment uses SECONDS.
 * The normalization step converts ms → s.
 * 
 * Field mapping:
 *   Supadata `lang` → our `language`
 *   Supadata `offset` (ms) → our `start` (s)
 *   Supadata `duration` (ms) → used to compute `end` (s)
 */

const SupadataSegmentSchema = z.object({
  text: z.string(),
  offset: z.number(),          // milliseconds
  duration: z.number(),        // milliseconds
});

const SupadataResponseSchema = z.object({
  lang: z.string().optional(),
  availableLangs: z.array(z.string()).optional(),
  content: z.union([
    z.array(SupadataSegmentSchema),
    z.string(),                // plain-text mode (text=true)
  ]).optional(),
});

/**
 * For long videos Supadata may answer HTTP 202 with `{ jobId }` instead of the
 * transcript. The result must then be polled at /v1/transcript/{jobId}.
 */
const SupadataJobSchema = z.object({
  jobId: z.string().min(1),
});

const SupadataJobStatusSchema = z.object({
  status: z.string(),
  error: z.unknown().optional(),
}).passthrough();

const JOB_POLL_INTERVAL_MS = 2000;
const JOB_MAX_WAIT_MS = 90_000;

const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class SupadataTranscriptProvider implements TranscriptProvider {
  private apiKey: string;

  constructor() {
    const key = process.env.SUPADATA_API_KEY;
    if (!key) {
      throw new Error("SUPADATA_API_KEY is not configured.");
    }
    this.apiKey = key;
  }

  async getTranscript(videoUrl: string): Promise<TranscriptProviderResult> {
    const requestUrl = new URL("https://api.supadata.ai/v1/transcript");
    requestUrl.searchParams.append("url", videoUrl);

    let lastError: TranscriptProviderError | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this._fetchTranscript(requestUrl.toString());
      } catch (error: unknown) {
        if (error instanceof TranscriptProviderError) {
          // Only retry transient errors
          if (error.code === 'RATE_LIMIT' || error.code === 'SERVER_ERROR') {
            lastError = error;
            // Exponential backoff: 1s, 2s
            if (attempt < MAX_RETRIES) {
              await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
              continue;
            }
          }
          // Non-retryable errors (NOT_FOUND, UNSUPPORTED): throw immediately
          throw error;
        }
        throw error;
      }
    }

    throw lastError || new TranscriptProviderError("Provider request failed after retries.", 'SERVER_ERROR');
  }

  private async _request(url: string): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          "x-api-key": this.apiKey,
        },
        signal: AbortSignal.timeout(30000),
      });
    } catch (error: unknown) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new TranscriptProviderError("Transcript provider timed out.", 'SERVER_ERROR');
      }
      throw new TranscriptProviderError(`Network error: ${error instanceof Error ? error.message : 'Unknown'}`, 'SERVER_ERROR');
    }

    return response;
  }

  private async _fetchTranscript(url: string): Promise<TranscriptProviderResult> {
    const response = await this._request(url);

    if (!response.ok) {
      if (response.status === 429) {
        throw new TranscriptProviderError("Rate limit exceeded.", 'RATE_LIMIT');
      }
      if (response.status === 401) {
        throw new TranscriptProviderError("Transcript provider rejected the API key (check SUPADATA_API_KEY).", 'UNSUPPORTED');
      }
      if (response.status === 404) {
        throw new TranscriptProviderError("Transcript not found for this video.", 'NOT_FOUND');
      }
      if (response.status === 400 || response.status === 403) {
        throw new TranscriptProviderError("Unsupported video or access denied.", 'UNSUPPORTED');
      }
      if (RETRYABLE_STATUSES.has(response.status)) {
        throw new TranscriptProviderError(`Provider returned ${response.status}`, 'SERVER_ERROR');
      }
      throw new TranscriptProviderError(`Provider returned ${response.status}`, 'SERVER_ERROR');
    }

    // 206: Supadata's "transcript unavailable" answer for this video.
    if (response.status === 206) {
      throw new TranscriptProviderError("No transcript is available for this video.", 'NOT_FOUND');
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new TranscriptProviderError("Invalid JSON from provider.", 'SERVER_ERROR');
    }

    // Long videos are processed asynchronously: poll the job until it finishes.
    const job = SupadataJobSchema.safeParse(data);
    if (job.success && (response.status === 202 || !(data as { content?: unknown }).content)) {
      data = await this._pollJob(job.data.jobId);
    }

    return this._normalize(data);
  }

  private async _pollJob(jobId: string): Promise<unknown> {
    const jobUrl = `https://api.supadata.ai/v1/transcript/${encodeURIComponent(jobId)}`;
    const deadline = Date.now() + JOB_MAX_WAIT_MS;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, JOB_POLL_INTERVAL_MS));
      const response = await this._request(jobUrl);
      if (!response.ok) {
        if (response.status === 429) throw new TranscriptProviderError("Rate limit exceeded.", 'RATE_LIMIT');
        throw new TranscriptProviderError(`Provider job returned ${response.status}`, 'SERVER_ERROR');
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new TranscriptProviderError("Invalid JSON from provider.", 'SERVER_ERROR');
      }
      const status = SupadataJobStatusSchema.safeParse(body);
      if (!status.success) return body; // already a transcript payload
      if (status.data.status === "completed") {
        const result = (body as { result?: unknown }).result;
        return result ?? body;
      }
      if (status.data.status === "failed") {
        throw new TranscriptProviderError("No transcript is available for this video.", 'NOT_FOUND');
      }
      // queued | active: keep polling
    }

    throw new TranscriptProviderError("Transcript provider timed out.", 'SERVER_ERROR');
  }

  private _normalize(data: unknown): TranscriptProviderResult {
    const parsed = SupadataResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw new TranscriptProviderError("Malformed response from provider.", 'SERVER_ERROR');
    }

    const content = parsed.data.content;

    // Handle plain-text response (shouldn't happen without text=true, but be safe)
    if (typeof content === 'string') {
      if (!content.trim()) {
        throw new TranscriptProviderError("Empty transcript returned.", 'NOT_FOUND');
      }
      return {
        segments: [{ start: 0, end: 0, text: content.trim() }],
        language: parsed.data.lang,
        isTranslated: false,
      };
    }

    if (!content || content.length === 0) {
      throw new TranscriptProviderError("Empty transcript returned.", 'NOT_FOUND');
    }

    // Validate and normalize segments
    const segments: NormalizedSegment[] = [];
    for (const s of content) {
      const text = s.text.trim();
      if (!text) continue;  // skip empty segments

      // Convert milliseconds to seconds
      const startSeconds = s.offset / 1000;
      const durationSeconds = s.duration / 1000;
      const endSeconds = startSeconds + durationSeconds;

      // Validate timestamps are non-negative
      if (startSeconds < 0 || endSeconds < 0) continue;

      segments.push({
        start: Math.round(startSeconds * 1000) / 1000,  // 3 decimal places
        end: Math.round(endSeconds * 1000) / 1000,
        text,
      });
    }

    if (segments.length === 0) {
      throw new TranscriptProviderError("No valid segments in transcript.", 'NOT_FOUND');
    }

    return {
      segments,
      language: parsed.data.lang,
      isTranslated: false,  // Supadata returns native captions by default
    };
  }
}
