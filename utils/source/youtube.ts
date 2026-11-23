import { SourceCategory } from "./categories";

export type YouTubeVideoState =
  | 'valid'
  | 'upcoming'
  | 'live'
  | 'unavailable'
  | 'private';

export interface YouTubeMetadata {
  id: string;
  state: YouTubeVideoState;
  title?: string;
  creatorName?: string;
  /**
   * Always present for 'valid' state when fetched via the Data API.
   * Never present for 'live', 'upcoming', 'private', 'unavailable'.
   */
  durationSeconds?: number;
  categories?: SourceCategory[];
  hasTranscript?: boolean;
}

// ---------------------------------------------------------------------------
// Public error class
// ---------------------------------------------------------------------------

/**
 * NO_API_KEY: YOUTUBE_DATA_API_KEY is not configured server-side.
 * NOT_FOUND: video does not exist or has been deleted.
 * FORBIDDEN: API quota exceeded or access denied.
 * TRANSIENT: temporary failure (network, 5xx, timeout). Safe to retry.
 */
export type YouTubeMetadataErrorCode =
  | 'NO_API_KEY'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'TRANSIENT';

export class YouTubeMetadataError extends Error {
  constructor(
    message: string,
    public readonly code: YouTubeMetadataErrorCode = 'TRANSIENT'
  ) {
    super(message);
    this.name = 'YouTubeMetadataError';
  }
}

// ---------------------------------------------------------------------------
// ISO 8601 duration parser
// ---------------------------------------------------------------------------

/**
 * Parses an ISO 8601 duration string (e.g. "PT1H42M10S") into total seconds.
 *
 * Returns undefined if the string is missing or unparseable. The caller
 * must treat undefined as "duration unknown, so fail closed".
 */
export function parseISO8601Duration(duration: string | undefined | null): number | undefined {
  if (!duration) return undefined;

  const match = duration.match(
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/
  );
  if (!match) return undefined;

  const days    = parseFloat(match[1] || '0');
  const hours   = parseFloat(match[2] || '0');
  const minutes = parseFloat(match[3] || '0');
  const seconds = parseFloat(match[4] || '0');

  const total = days * 86400 + hours * 3600 + minutes * 60 + seconds;

  if (!isFinite(total) || total < 0) return undefined;
  return Math.round(total);
}

// ---------------------------------------------------------------------------
// YouTube Data API v3
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// Fixed endpoint, never built from user input (prevents SSRF).
const DATA_API_BASE = "https://www.googleapis.com/youtube/v3/videos";

interface DataApiVideoItem {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    liveBroadcastContent?: 'live' | 'upcoming' | 'none' | string;
    defaultAudioLanguage?: string;
    categoryId?: string;
  };
  contentDetails?: {
    duration?: string;           // ISO 8601
    caption?: 'true' | 'false';
  };
  status?: {
    privacyStatus?: 'public' | 'private' | 'unlisted';
    embeddable?: boolean;
    madeForKids?: boolean;
  };
}

interface DataApiResponse {
  items?: DataApiVideoItem[];
  error?: { code: number; message: string };
}

async function fetchFromDataAPI(videoId: string, apiKey: string): Promise<YouTubeMetadata> {
  // videoId was already validated by parseYouTubeUrl, so it is safe to interpolate.
  const url = new URL(DATA_API_BASE);
  url.searchParams.set("part", "snippet,contentDetails,status");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;

    try {
      res = await fetch(url.toString(), {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(10000),
      });
    } catch (err: unknown) {
      const isTimeout =
        err instanceof Error &&
        (err.name === 'AbortError' || err.name === 'TimeoutError');
      if (isTimeout && attempt < MAX_RETRIES) {
        lastError = err instanceof Error ? err : new Error(String(err));
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw new YouTubeMetadataError(
        "We couldn't check this video right now. Please try again.",
        'TRANSIENT'
      );
    }

    if (!res.ok) {
      if (res.status === 400) {
        throw new YouTubeMetadataError("We couldn't find this YouTube video.", 'NOT_FOUND');
      }
      if (res.status === 403) {
        throw new YouTubeMetadataError("We couldn't access this YouTube video.", 'FORBIDDEN');
      }
      if (res.status === 404) {
        throw new YouTubeMetadataError("We couldn't find this YouTube video.", 'NOT_FOUND');
      }
      if (RETRYABLE_STATUSES.has(res.status)) {
        if (attempt < MAX_RETRIES) {
          lastError = new Error(`HTTP ${res.status}`);
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new YouTubeMetadataError(
          "We couldn't check this video right now. Please try again.",
          'TRANSIENT'
        );
      }
      throw new YouTubeMetadataError(
        "We couldn't check this video right now. Please try again.",
        'TRANSIENT'
      );
    }

    let body: DataApiResponse;
    try {
      body = await res.json() as DataApiResponse;
    } catch {
      throw new YouTubeMetadataError(
        "We couldn't check this video right now. Please try again.",
        'TRANSIENT'
      );
    }

    if (body.error) {
      const code = body.error.code;
      if (code === 403) {
        throw new YouTubeMetadataError("We couldn't access this YouTube video.", 'FORBIDDEN');
      }
      if (code === 404) {
        throw new YouTubeMetadataError("We couldn't find this YouTube video.", 'NOT_FOUND');
      }
      throw new YouTubeMetadataError(
        "We couldn't check this video right now. Please try again.",
        'TRANSIENT'
      );
    }

    if (!body.items || body.items.length === 0) {
      return { id: videoId, state: 'unavailable' };
    }

    return normalizeDataApiItem(body.items[0]);
  }

  throw lastError
    ? new YouTubeMetadataError(
        "We couldn't check this video right now. Please try again.",
        'TRANSIENT'
      )
    : new YouTubeMetadataError(
        "We couldn't check this video right now. Please try again.",
        'TRANSIENT'
      );
}

function normalizeDataApiItem(item: DataApiVideoItem): YouTubeMetadata {
  const id = item.id;
  const snippet = item.snippet ?? {};
  const contentDetails = item.contentDetails ?? {};
  const status = item.status ?? {};

  if (status.privacyStatus === 'private') {
    return { id, state: 'private' };
  }

  const broadcast = snippet.liveBroadcastContent;
  if (broadcast === 'live') {
    return {
      id,
      state: 'live',
      title: snippet.title,
      creatorName: snippet.channelTitle,
    };
  }
  if (broadcast === 'upcoming') {
    return {
      id,
      state: 'upcoming',
      title: snippet.title,
      creatorName: snippet.channelTitle,
    };
  }

  const durationSeconds = parseISO8601Duration(contentDetails.duration);
  const hasTranscript = contentDetails.caption === 'true';

  return {
    id,
    state: 'valid',
    title: snippet.title,
    creatorName: snippet.channelTitle,
    durationSeconds,
    hasTranscript,
    categories: [],
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Fetches YouTube video metadata using the YouTube Data API v3.
 *
 * REQUIRES: YOUTUBE_DATA_API_KEY environment variable (server-only).
 *
 * If the key is missing, throws YouTubeMetadataError('NO_API_KEY') immediately.
 * The caller (preflight) must treat this as a hard rejection: no transcript
 * or AI work should proceed without verified duration.
 *
 * There is no oEmbed fallback. Duration is a safety-critical field.
 * If the duration is unknown, the app must fail closed.
 */
export async function getYouTubeMetadata(videoId: string): Promise<YouTubeMetadata> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;

  if (!apiKey) {
    throw new YouTubeMetadataError(
      "Verbatim can't verify this video's length right now. Please try again later.",
      'NO_API_KEY'
    );
  }

  try {
    return await fetchFromDataAPI(videoId, apiKey);
  } catch (err) {
    if (err instanceof YouTubeMetadataError) throw err;
    throw new YouTubeMetadataError(
      "We couldn't check this video right now. Please try again.",
      'TRANSIENT'
    );
  }
}
