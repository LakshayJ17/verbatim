import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupadataTranscriptProvider } from './supadata';

describe('SupadataTranscriptProvider', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('SUPADATA_API_KEY', 'test_key');
    vi.restoreAllMocks();
  });

  it('throws if API key is not set', () => {
    vi.stubEnv('SUPADATA_API_KEY', '');
    expect(() => new SupadataTranscriptProvider()).toThrow('SUPADATA_API_KEY is not configured');
  });

  it('fetches and normalizes transcript — converts ms to seconds', async () => {
    // Real Supadata API format: offset and duration in MILLISECONDS
    const mockResponse = {
      lang: 'en',
      availableLangs: ['en', 'es'],
      content: [
        { text: 'Hello world', offset: 0, duration: 5489 },
        { text: 'Welcome to Verbatim', offset: 5489, duration: 4200 }
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const provider = new SupadataTranscriptProvider();
    const result = await provider.getTranscript('https://youtube.com/watch?v=123');

    expect(result.segments).toHaveLength(2);
    // Verify ms → s conversion
    expect(result.segments[0].start).toBe(0);
    expect(result.segments[0].end).toBe(5.489);
    expect(result.segments[0].text).toBe('Hello world');
    expect(result.segments[1].start).toBe(5.489);
    expect(result.segments[1].end).toBe(9.689);
    expect(result.language).toBe('en');
    expect(result.isTranslated).toBe(false);
  });

  it('validates timestamps: start < end, both non-negative', async () => {
    const mockResponse = {
      lang: 'en',
      content: [
        { text: 'Valid segment', offset: 1000, duration: 2000 },
        { text: 'Negative offset', offset: -500, duration: 1000 },
        { text: 'Empty text', offset: 5000, duration: 1000 },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const provider = new SupadataTranscriptProvider();
    const result = await provider.getTranscript('https://youtube.com/watch?v=123');

    // Only the valid segment should remain (negative offset skipped, but 'Empty text' is valid text)
    // Actually re-reading: negative offset segment gets filtered, "Empty text" has non-empty text so it passes
    expect(result.segments.length).toBe(2); // Valid segment + "Empty text"
    expect(result.segments[0].start).toBe(1);
    expect(result.segments[0].end).toBe(3);
  });

  it('handles empty transcript', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ lang: 'en', content: [] })
    });

    const provider = new SupadataTranscriptProvider();
    await expect(provider.getTranscript('https://youtube.com/watch?v=123'))
      .rejects.toThrow('Empty transcript returned.');
  });

  it('handles 429 rate limit', async () => {
    // With retries, it should retry twice then throw
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({ ok: false, status: 429 });
    });

    const provider = new SupadataTranscriptProvider();
    await expect(provider.getTranscript('https://youtube.com/watch?v=123'))
      .rejects.toThrow('Rate limit exceeded.');
    // Should have retried: 1 initial + 2 retries = 3 calls
    expect(callCount).toBe(3);
  });

  it('handles 404 not found without retry', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({ ok: false, status: 404 });
    });

    const provider = new SupadataTranscriptProvider();
    await expect(provider.getTranscript('https://youtube.com/watch?v=123'))
      .rejects.toThrow('Transcript not found for this video.');
    // 404 is NOT retryable — should be exactly 1 call
    expect(callCount).toBe(1);
  });

  it('handles 403 without retry', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({ ok: false, status: 403 });
    });

    const provider = new SupadataTranscriptProvider();
    await expect(provider.getTranscript('https://youtube.com/watch?v=123'))
      .rejects.toThrow('Unsupported video or access denied.');
    expect(callCount).toBe(1);
  });

  it('handles 500 with retry and eventual success', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 2) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          lang: 'en',
          content: [{ text: 'After retry', offset: 0, duration: 3000 }]
        })
      });
    });

    const provider = new SupadataTranscriptProvider();
    const result = await provider.getTranscript('https://youtube.com/watch?v=123');

    expect(callCount).toBe(2);
    expect(result.segments[0].text).toBe('After retry');
  });

  it('handles malformed JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('not json'))
    });

    const provider = new SupadataTranscriptProvider();
    // Will retry because it's a SERVER_ERROR
    await expect(provider.getTranscript('https://youtube.com/watch?v=123'))
      .rejects.toThrow('Invalid JSON from provider.');
  });

  it('handles malformed response structure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ unexpected_field: true })
    });

    const provider = new SupadataTranscriptProvider();
    // content is undefined → empty transcript
    await expect(provider.getTranscript('https://youtube.com/watch?v=123'))
      .rejects.toThrow('Empty transcript returned.');
  });

  it('handles plain text response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        lang: 'en',
        content: 'This is a full transcript as plain text.'
      })
    });

    const provider = new SupadataTranscriptProvider();
    const result = await provider.getTranscript('https://youtube.com/watch?v=123');
    
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].text).toBe('This is a full transcript as plain text.');
    expect(result.segments[0].start).toBe(0);
  });

  it('polls async job (202 + jobId) until the transcript is ready', async () => {
    vi.useFakeTimers();
    try {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, status: 202, json: () => Promise.resolve({ jobId: 'job_1' }) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ status: 'active' }) })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            status: 'completed',
            result: { lang: 'en', content: [{ text: 'Long video line', offset: 1000, duration: 1000 }] },
          }),
        });

      const provider = new SupadataTranscriptProvider();
      const pending = provider.getTranscript('https://youtube.com/watch?v=123');
      await vi.advanceTimersByTimeAsync(5000);
      const result = await pending;

      expect(result.segments).toEqual([{ start: 1, end: 2, text: 'Long video line' }]);
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][0]).toContain('/v1/transcript/job_1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats 206 as transcript unavailable without retry', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 206,
      json: () => Promise.resolve({ error: 'transcript-unavailable' }),
    });

    const provider = new SupadataTranscriptProvider();
    await expect(provider.getTranscript('https://youtube.com/watch?v=123'))
      .rejects.toThrow('No transcript is available for this video.');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
