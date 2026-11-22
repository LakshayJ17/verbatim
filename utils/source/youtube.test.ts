import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseISO8601Duration, getYouTubeMetadata } from './youtube';

// ─────────────────────────────────────────────────────────────────────────────
// ISO 8601 duration parser
// ─────────────────────────────────────────────────────────────────────────────

describe('parseISO8601Duration', () => {
  it('PT5M → 300', () => {
    expect(parseISO8601Duration('PT5M')).toBe(300);
  });

  it('PT59M59S → 3599', () => {
    expect(parseISO8601Duration('PT59M59S')).toBe(3599);
  });

  it('PT1H → 3600', () => {
    expect(parseISO8601Duration('PT1H')).toBe(3600);
  });

  it('PT2H → 7200', () => {
    expect(parseISO8601Duration('PT2H')).toBe(7200);
  });

  it('PT2H1M → 7260 (too long past 7200)', () => {
    expect(parseISO8601Duration('PT2H1M')).toBe(7260);
  });

  it('PT10H → 36000', () => {
    expect(parseISO8601Duration('PT10H')).toBe(36000);
  });

  it('PT1H42M10S → 6130', () => {
    expect(parseISO8601Duration('PT1H42M10S')).toBe(6130);
  });

  it('PT18M32S → 1112', () => {
    expect(parseISO8601Duration('PT18M32S')).toBe(1112);
  });

  it('missing duration (undefined) → undefined', () => {
    expect(parseISO8601Duration(undefined)).toBeUndefined();
  });

  it('empty string → undefined', () => {
    expect(parseISO8601Duration('')).toBeUndefined();
  });

  it('invalid string → undefined', () => {
    expect(parseISO8601Duration('not-a-duration')).toBeUndefined();
  });

  it('P0D edge case → 0', () => {
    expect(parseISO8601Duration('P0DT0H0M0S')).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getYouTubeMetadata — Data API path (YOUTUBE_DATA_API_KEY set)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a minimal realistic YouTube Data API v3 videos.list response.
 */
function makeDataApiResponse(overrides: {
  privacyStatus?: string;
  liveBroadcastContent?: string;
  duration?: string;
  caption?: string;
  title?: string;
  channelTitle?: string;
} = {}) {
  return {
    items: [
      {
        id: 'testVideoId',
        snippet: {
          title: overrides.title ?? 'Test Video',
          channelTitle: overrides.channelTitle ?? 'Test Channel',
          liveBroadcastContent: overrides.liveBroadcastContent ?? 'none',
        },
        contentDetails: {
          duration: overrides.duration ?? 'PT30M',
          caption: overrides.caption ?? 'false',
        },
        status: {
          privacyStatus: overrides.privacyStatus ?? 'public',
        },
      },
    ],
  };
}

describe('getYouTubeMetadata — Data API', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('YOUTUBE_DATA_API_KEY', 'test_data_api_key');
    vi.restoreAllMocks();
  });

  it('normal public video → valid with title, creator, duration', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeDataApiResponse({
        duration: 'PT1H42M10S',
        title: 'Great Podcast',
        channelTitle: 'Podcast Channel',
      })),
    });

    const result = await getYouTubeMetadata('testVideoId');

    expect(result.state).toBe('valid');
    expect(result.title).toBe('Great Podcast');
    expect(result.creatorName).toBe('Podcast Channel');
    expect(result.durationSeconds).toBe(6130);
    expect(result.id).toBe('testVideoId');
  });

  it('private video → state: private', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeDataApiResponse({ privacyStatus: 'private' })),
    });

    const result = await getYouTubeMetadata('testVideoId');
    expect(result.state).toBe('private');
  });

  it('live broadcast → state: live', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeDataApiResponse({ liveBroadcastContent: 'live' })),
    });

    const result = await getYouTubeMetadata('testVideoId');
    expect(result.state).toBe('live');
  });

  it('upcoming broadcast → state: upcoming', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeDataApiResponse({ liveBroadcastContent: 'upcoming' })),
    });

    const result = await getYouTubeMetadata('testVideoId');
    expect(result.state).toBe('upcoming');
  });

  it('completed livestream (liveBroadcastContent: none) → state: valid (normal processing)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeDataApiResponse({
        liveBroadcastContent: 'none',
        duration: 'PT2H30M',
      })),
    });

    const result = await getYouTubeMetadata('testVideoId');
    expect(result.state).toBe('valid');
    expect(result.durationSeconds).toBe(9000);
  });

  it('video not found (empty items) → state: unavailable', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });

    const result = await getYouTubeMetadata('testVideoId');
    expect(result.state).toBe('unavailable');
  });

  it('404 HTTP → throws YouTubeMetadataError NOT_FOUND', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    await expect(getYouTubeMetadata('testVideoId'))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('403 HTTP → throws YouTubeMetadataError FORBIDDEN', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });

    await expect(getYouTubeMetadata('testVideoId'))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('429 HTTP → retries and eventually throws TRANSIENT', async () => {
    let calls = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      calls++;
      return Promise.resolve({ ok: false, status: 429 });
    });

    await expect(getYouTubeMetadata('testVideoId'))
      .rejects.toMatchObject({ code: 'TRANSIENT' });
    expect(calls).toBe(3); // 1 initial + 2 retries
  });

  it('500 HTTP retries and succeeds on second attempt', async () => {
    let calls = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) return Promise.resolve({ ok: false, status: 500 });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(makeDataApiResponse({ duration: 'PT45M' })),
      });
    });

    const result = await getYouTubeMetadata('testVideoId');
    expect(calls).toBe(2);
    expect(result.state).toBe('valid');
    expect(result.durationSeconds).toBe(2700);
  });

  it('malformed JSON → throws TRANSIENT', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('bad json')),
    });

    await expect(getYouTubeMetadata('testVideoId'))
      .rejects.toMatchObject({ code: 'TRANSIENT' });
  });

  it('invalid API response structure (no items field) → throws TRANSIENT', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ kind: 'youtube#videoListResponse' }), // no items
    });

    const result = await getYouTubeMetadata('testVideoId');
    expect(result.state).toBe('unavailable');
  });

  it('API-level 403 error in 200 body → throws FORBIDDEN', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ error: { code: 403, message: 'quota exceeded' } }),
    });

    await expect(getYouTubeMetadata('testVideoId'))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('missing duration in response → durationSeconds is undefined (safe)', async () => {
    // Return a response where contentDetails.duration is omitted entirely
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        items: [{
          id: 'testVideoId',
          snippet: {
            title: 'No Duration',
            channelTitle: 'Channel',
            liveBroadcastContent: 'none',
          },
          contentDetails: {
            // duration intentionally absent
            caption: 'false',
          },
          status: { privacyStatus: 'public' },
        }],
      }),
    });

    const result = await getYouTubeMetadata('testVideoId');
    expect(result.state).toBe('valid');
    expect(result.durationSeconds).toBeUndefined();
  });

  it('caption: true → hasTranscript is true', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeDataApiResponse({ caption: 'true' })),
    });

    const result = await getYouTubeMetadata('testVideoId');
    expect(result.hasTranscript).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getYouTubeMetadata — no API key → throws immediately (fail closed)
// ─────────────────────────────────────────────────────────────────────────────

describe('getYouTubeMetadata — no API key', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('YOUTUBE_DATA_API_KEY', '');
    vi.restoreAllMocks();
  });

  it('missing API key → throws YouTubeMetadataError NO_API_KEY without calling fetch', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    await expect(getYouTubeMetadata('testVideoId'))
      .rejects.toMatchObject({ code: 'NO_API_KEY' });

    // fetch must never be called — no expensive external request
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
