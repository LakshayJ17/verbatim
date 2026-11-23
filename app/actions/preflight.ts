"use server";

import { createClient } from "@/utils/supabase/server";
import { consumeRateLimit } from "@/utils/rate-limit";
import { parseYouTubeUrl } from "@/utils/source/normalization";
import { getYouTubeMetadata, YouTubeMetadataError } from "@/utils/source/youtube";
import { filterValidCategories, SourceCategory } from "@/utils/source/categories";

export type NextAction = 'try_another' | 'explore_discover' | 'view_existing';

export type PreflightResult = {
  isValid: boolean;
  sourceType?: 'youtube' | 'file';
  externalId?: string;
  title?: string;
  creatorName?: string;
  durationSeconds?: number;
  categories?: SourceCategory[];
  errorMessage?: string;
  nextAction?: NextAction;
  existingSourceId?: string;
};

const MAX_CONTENT_DURATION_SECONDS = parseInt(
  process.env.MAX_CONTENT_DURATION_SECONDS || "7200",
  10
);

export async function preflightSource(inputUrl: string): Promise<PreflightResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { isValid: false, errorMessage: "Unauthorized", nextAction: 'try_another' };
  }

  if (user.is_anonymous) {
    return {
      isValid: false,
      errorMessage: "Guests cannot analyze new content.",
      nextAction: 'explore_discover',
    };
  }

  // ── 1. URL validation ──────────────────────────────────────────────────────
  const parsed = parseYouTubeUrl(inputUrl);

  if (parsed.type === 'playlist') {
    return {
      isValid: false,
      errorMessage: "Playlists are not supported. Please provide a specific long-form video.",
      nextAction: 'try_another',
    };
  }

  if (parsed.type === 'channel') {
    return {
      isValid: false,
      errorMessage: "Channel URLs are not supported. Please provide a specific video.",
      nextAction: 'try_another',
    };
  }

  if (parsed.type === 'shorts') {
    return {
      isValid: false,
      errorMessage: "YouTube Shorts are too short for deep analysis. Please provide a long-form video.",
      nextAction: 'explore_discover',
    };
  }

  if (parsed.type === 'unsupported' || !parsed.id) {
    return {
      isValid: false,
      errorMessage: "Verbatim currently supports specific long-form YouTube videos and transcript uploads.",
      nextAction: 'try_another',
    };
  }

  const externalId = parsed.id;
  // YouTube ids are exactly 11 of these characters; anything else would only
  // waste a Data API call.
  if (!/^[A-Za-z0-9_-]{11}$/.test(externalId)) {
    return { isValid: false, errorMessage: "That doesn't look like a YouTube video link.", nextAction: 'try_another' };
  }
  // Each check spends the shared YouTube Data API quota, so it is limited per
  // account; otherwise one script could use up the day's quota for everyone.
  const preflightLimit = await consumeRateLimit(supabase, "preflight");
  if (!preflightLimit.ok) {
    return { isValid: false, errorMessage: preflightLimit.error, nextAction: 'try_another' };
  }

  // ── 2. Duplicate check (DB lookup before any external API call) ───────────
  const { data: existing } = await supabase
    .from('sources')
    .select('id')
    .eq('user_id', user.id)
    .eq('external_id', externalId)
    .eq('source_type', 'youtube')
    .maybeSingle();

  if (existing) {
    return {
      isValid: false,
      errorMessage: "You have already added this source to your library.",
      nextAction: 'view_existing',
      existingSourceId: existing.id,
    };
  }

  // ── 3. YouTube metadata (Data API — required) ─────────────────────────────
  let metadata;
  try {
    metadata = await getYouTubeMetadata(externalId);
  } catch (err) {
    if (err instanceof YouTubeMetadataError) {
      if (err.code === 'NO_API_KEY') {
        return {
          isValid: false,
          errorMessage: "Verbatim can't verify this video's length right now. Please try again later.",
          nextAction: 'try_another',
        };
      }
      if (err.code === 'NOT_FOUND') {
        return {
          isValid: false,
          errorMessage: "We couldn't find this YouTube video.",
          nextAction: 'try_another',
        };
      }
      if (err.code === 'FORBIDDEN') {
        return {
          isValid: false,
          errorMessage: "We couldn't access this YouTube video.",
          nextAction: 'try_another',
        };
      }
      // TRANSIENT
      return {
        isValid: false,
        errorMessage: "We couldn't check this video right now. Please try again.",
        nextAction: 'try_another',
      };
    }
    return {
      isValid: false,
      errorMessage: "We couldn't check this video right now. Please try again.",
      nextAction: 'try_another',
    };
  }

  // ── 4. Availability checks ────────────────────────────────────────────────
  if (metadata.state === 'private' || metadata.state === 'unavailable') {
    return {
      isValid: false,
      errorMessage: "We couldn't access this conversation.",
      nextAction: 'try_another',
    };
  }

  if (metadata.state === 'live') {
    return {
      isValid: false,
      errorMessage: "This broadcast is currently live. Try again after it ends.",
      nextAction: 'explore_discover',
    };
  }

  if (metadata.state === 'upcoming') {
    return {
      isValid: false,
      errorMessage: "This broadcast hasn't started yet.",
      nextAction: 'explore_discover',
    };
  }

  // ── 5. Fail closed: duration MUST be known ────────────────────────────────
  //
  // If the Data API returns a valid video but no duration (e.g. the field is
  // absent from the response), we cannot enforce the 2-hour limit. Rather than
  // silently allowing potentially unlimited processing, we reject here.
  //
  // This should be rare in practice — the Data API reliably returns duration
  // for normal public videos. When it does happen it is treated as a transient
  // service issue, not a permanent rejection.
  if (metadata.durationSeconds === undefined) {
    return {
      isValid: false,
      errorMessage: "Verbatim can't verify this video's length right now. Please try again later.",
      nextAction: 'try_another',
    };
  }

  // ── 6. Duration gate (before any transcript/AI cost) ─────────────────────
  if (metadata.durationSeconds > MAX_CONTENT_DURATION_SECONDS) {
    const maxHours = Math.floor(MAX_CONTENT_DURATION_SECONDS / 3600);
    return {
      isValid: false,
      errorMessage: `Verbatim currently supports conversations up to ${maxHours} hours. This video is too long.`,
      nextAction: 'explore_discover',
    };
  }

  // ── 7. Valid ──────────────────────────────────────────────────────────────
  return {
    isValid: true,
    sourceType: 'youtube',
    externalId: metadata.id,
    title: metadata.title,
    creatorName: metadata.creatorName,
    durationSeconds: metadata.durationSeconds,
    categories: metadata.categories ? filterValidCategories(metadata.categories) : [],
  };
}
