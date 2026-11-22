/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preflightSource } from './preflight';
import * as youtubeModule from '@/utils/source/youtube';
import * as supabaseServer from '@/utils/supabase/server';

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/utils/source/youtube', () => ({
  getYouTubeMetadata: vi.fn(),
  YouTubeMetadataError: class YouTubeMetadataError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'YouTubeMetadataError';
      this.code = code;
    }
  },
}));

// Convenience: construct a mock YouTubeMetadataError using the mock class.
function makeMetadataError(message: string, code: string) {
  return new (youtubeModule.YouTubeMetadataError as any)(message, code);
}

describe('Preflight Source', () => {
  const mockGetUser = vi.fn();
  const mockSelect = vi.fn();
  const mockEq1 = vi.fn();
  const mockEq2 = vi.fn();
  const mockEq3 = vi.fn();
  const mockMaybeSingle = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();

    // Authenticated non-anonymous user
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', is_anonymous: false } },
    });

    // Default: no existing source
    mockMaybeSingle.mockResolvedValue({ data: null });
    mockEq3.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockEq2.mockReturnValue({ eq: mockEq3 });
    mockEq1.mockReturnValue({ eq: mockEq2 });
    mockSelect.mockReturnValue({ eq: mockEq1 });

    (supabaseServer.createClient as any).mockResolvedValue({
      auth: { getUser: mockGetUser },
      from: () => ({ select: mockSelect }),
    });
  });

  // ── URL validation ──────────────────────────────────────────────────────────

  it('invalid (non-YouTube) URL → unsupported', async () => {
    const result = await preflightSource('https://invalid.com/video');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('supports specific long-form YouTube videos');
  });

  it('playlist URL → rejected', async () => {
    const result = await preflightSource('https://youtube.com/playlist?list=PL123');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('Playlists are not supported');
  });

  it('channel URL → rejected', async () => {
    const result = await preflightSource('https://youtube.com/@someChannel');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('Channel URLs are not supported');
  });

  it('Shorts URL → rejected', async () => {
    const result = await preflightSource('https://youtube.com/shorts/abc123');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('too short');
  });

  // ── Duplicate detection ─────────────────────────────────────────────────────

  it('duplicate source → returns existingSourceId', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'existing-source-id' } });

    const result = await preflightSource('https://youtube.com/watch?v=duplicate123');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('already added this source');
    expect(result.existingSourceId).toBe('existing-source-id');
    expect(result.nextAction).toBe('view_existing');
  });

  // ── Metadata / availability states ─────────────────────────────────────────

  it('valid public video with duration → isValid: true, returns durationSeconds', async () => {
    (youtubeModule.getYouTubeMetadata as any).mockResolvedValue({
      id: 'abc12345',
      state: 'valid',
      title: 'Valid Video',
      creatorName: 'Test Channel',
      durationSeconds: 600,
      hasTranscript: true,
    });

    const result = await preflightSource('https://youtube.com/watch?v=abc12345');

    expect(result.isValid).toBe(true);
    expect(result.title).toBe('Valid Video');
    expect(result.creatorName).toBe('Test Channel');
    expect(result.durationSeconds).toBe(600);
    expect(result.errorMessage).toBeUndefined();
  });

  it('private video → rejected with access error', async () => {
    (youtubeModule.getYouTubeMetadata as any).mockResolvedValue({
      id: 'private123',
      state: 'private',
    });

    const result = await preflightSource('https://youtube.com/watch?v=private123');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain("couldn't access this conversation");
  });

  it('unavailable video → rejected', async () => {
    (youtubeModule.getYouTubeMetadata as any).mockResolvedValue({
      id: 'gone123',
      state: 'unavailable',
    });

    const result = await preflightSource('https://youtube.com/watch?v=gone123');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain("couldn't access this conversation");
  });

  it('live broadcast → rejected', async () => {
    (youtubeModule.getYouTubeMetadata as any).mockResolvedValue({
      id: 'live123',
      state: 'live',
    });

    const result = await preflightSource('https://youtube.com/watch?v=live123');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('currently live');
  });

  it('upcoming broadcast → rejected', async () => {
    (youtubeModule.getYouTubeMetadata as any).mockResolvedValue({
      id: 'upcoming123',
      state: 'upcoming',
    });

    const result = await preflightSource('https://youtube.com/watch?v=upcoming123');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain("hasn't started yet");
  });

  // ── Duration gate ───────────────────────────────────────────────────────────

  it('video exactly at limit (7200s) → valid', async () => {
    (youtubeModule.getYouTubeMetadata as any).mockResolvedValue({
      id: 'exact123',
      state: 'valid',
      title: 'Long Podcast',
      durationSeconds: 7200,
    });

    const result = await preflightSource('https://youtube.com/watch?v=exact123');
    expect(result.isValid).toBe(true);
    expect(result.durationSeconds).toBe(7200);
  });

  it('video 1 second over limit (7201s) → rejected as too long', async () => {
    (youtubeModule.getYouTubeMetadata as any).mockResolvedValue({
      id: 'long123',
      state: 'valid',
      durationSeconds: 7201,
    });

    const result = await preflightSource('https://youtube.com/watch?v=long123');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('too long');
    expect(result.nextAction).toBe('explore_discover');
  });

  it('10-hour video → rejected as too long', async () => {
    (youtubeModule.getYouTubeMetadata as any).mockResolvedValue({
      id: 'marathon123',
      state: 'valid',
      durationSeconds: 36000,
    });

    const result = await preflightSource('https://youtube.com/watch?v=marathon123');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('too long');
  });

  it('missing durationSeconds from Data API → rejected (fail closed)', async () => {
    // Data API returned a valid video but no duration field.
    // The application must reject — unknown duration = cannot proceed.
    (youtubeModule.getYouTubeMetadata as any).mockResolvedValue({
      id: 'noduration123',
      state: 'valid',
      title: 'No Duration Video',
      durationSeconds: undefined,
    });

    const result = await preflightSource('https://youtube.com/watch?v=noduration123');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain("can't verify this video's length");
    expect(result.nextAction).toBe('try_another');
  });

  // ── YouTubeMetadataError handling ───────────────────────────────────────────

  it('NO_API_KEY → clean configuration error, no transcript/AI call', async () => {
    (youtubeModule.getYouTubeMetadata as any).mockRejectedValue(
      makeMetadataError(
        "Verbatim can't verify this video's length right now. Please try again later.",
        'NO_API_KEY'
      )
    );

    const result = await preflightSource('https://youtube.com/watch?v=abc123');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain("can't verify this video's length");
    expect(result.nextAction).toBe('try_another');
  });

  it('YouTubeMetadataError NOT_FOUND → clean user-facing message', async () => {
    (youtubeModule.getYouTubeMetadata as any).mockRejectedValue(
      makeMetadataError("We couldn't find this YouTube video.", 'NOT_FOUND')
    );

    const result = await preflightSource('https://youtube.com/watch?v=missing123');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain("couldn't find");
    expect(result.nextAction).toBe('try_another');
  });

  it('YouTubeMetadataError FORBIDDEN → clean user-facing message', async () => {
    (youtubeModule.getYouTubeMetadata as any).mockRejectedValue(
      makeMetadataError("We couldn't access this YouTube video.", 'FORBIDDEN')
    );

    const result = await preflightSource('https://youtube.com/watch?v=restricted123');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain("couldn't access");
    expect(result.nextAction).toBe('try_another');
  });

  it('YouTubeMetadataError TRANSIENT → retry message', async () => {
    (youtubeModule.getYouTubeMetadata as any).mockRejectedValue(
      makeMetadataError("We couldn't check this video right now. Please try again.", 'TRANSIENT')
    );

    const result = await preflightSource('https://youtube.com/watch?v=slow123');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('try again');
    expect(result.nextAction).toBe('try_another');
  });

  it('unexpected error from getYouTubeMetadata → safe fallback', async () => {
    (youtubeModule.getYouTubeMetadata as any).mockRejectedValue(
      new Error('Something completely unexpected')
    );

    const result = await preflightSource('https://youtube.com/watch?v=broken123');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('try again');
  });

  // ── Guest / auth ────────────────────────────────────────────────────────────

  it('anonymous user → rejected before any API call', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'anon-1', is_anonymous: true } },
    });

    const result = await preflightSource('https://youtube.com/watch?v=abc123');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain('Guests cannot');
    expect(youtubeModule.getYouTubeMetadata).not.toHaveBeenCalled();
  });
});
