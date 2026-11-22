import { describe, it, expect } from 'vitest';
import { chunkTranscript } from './chunking';
import { verifyQuote } from './verification';
import { NormalizedSegment } from '../parsers';

describe('AI Pipeline Core Logic', () => {
  describe('Chunking Strategy', () => {
    it('preserves exact segment boundaries', () => {
      const segments: NormalizedSegment[] = [
        { text: 'Hello world', start: 0, end: 1 },
        { text: 'This is a long sentence to test tokenization.', start: 1, end: 4 },
      ];
      const chunks = chunkTranscript(segments);
      expect(chunks.length).toBe(1);
      expect(chunks[0].segments.length).toBe(2);
      expect(chunks[0].text).toContain('Hello world');
    });

    it('creates overlapping chunks for large transcripts', () => {
      // Simulate a large transcript by making a segment with a massive amount of text
      const giantText = 'word '.repeat(3000); // approx 15000 chars, ~3750 tokens
      const segments: NormalizedSegment[] = [
        { text: giantText, start: 0, end: 10 },
        { text: giantText, start: 10, end: 20 },
        { text: giantText, start: 20, end: 30 },
        { text: giantText, start: 30, end: 40 }, // Added 4th segment so it exceeds limits before end
      ];
      const chunks = chunkTranscript(segments);
      expect(chunks.length).toBeGreaterThan(1);
      // Verify timestamp preservation
      expect(chunks[0].startSeconds).toBe(0);
    });
  });

  describe('Quote Verification', () => {
    const segments: NormalizedSegment[] = [
      { text: 'We must build reliable systems.', start: 0, end: 2, speaker: 'Alice' },
      { text: 'Because failure is not an option when scaling.', start: 2, end: 5, speaker: 'Alice' }
    ];

    it('marks exact matches as verified', () => {
      const quote = {
        text: 'failure is not an option',
        whyItMatters: 'important',
        confidence: 0.9
      };
      const result = verifyQuote(quote, segments);
      expect(result.verificationStatus).toBe('verified');
    });

    it('marks close fuzzy matches as needs_review', () => {
      const quote = {
        text: 'failure is simply not an option', // 'simply' is hallucinated
        whyItMatters: 'important',
        confidence: 0.9
      };
      const result = verifyQuote(quote, segments);
      expect(result.verificationStatus).toBe('needs_review');
    });

    it('matches whole words only (no match inside another word)', () => {
      const words: NormalizedSegment[] = [{ text: 'Every failure teaches something.', start: 0, end: 3 }];
      // "ailure teaches" only appears inside "failure teaches"
      expect(verifyQuote({ text: 'ailure teaches', whyItMatters: 'x', confidence: 1 }, words).verificationStatus).toBe('rejected');
      expect(verifyQuote({ text: 'failure teaches', whyItMatters: 'x', confidence: 1 }, words).verificationStatus).toBe('verified');
    });

    it('takes timestamps from the transcript, not the model', () => {
      const timed: NormalizedSegment[] = [
        { text: 'intro words here', start: 0, end: 4 },
        { text: 'the real quote starts', start: 120, end: 124 },
        { text: 'and ends right here', start: 124, end: 128 },
      ];
      const result = verifyQuote(
        { text: 'The real quote starts and ends right here.', whyItMatters: 'x', confidence: 1, startTimestamp: 5, endTimestamp: 9 },
        timed
      );
      expect(result.verificationStatus).toBe('verified');
      expect(result.startTimestamp).toBe(120);
      expect(result.endTimestamp).toBe(128);
    });

    it('fuzzy matching tries every occurrence of the first word', () => {
      const repeated: NormalizedSegment[] = [
        { text: 'the weather is nice today and', start: 0, end: 3 },
        { text: 'the best ideas come from listening to customers', start: 60, end: 64 },
      ];
      const result = verifyQuote(
        { text: 'the best ideas really come from listening to customers', whyItMatters: 'x', confidence: 1 },
        repeated
      );
      expect(result.verificationStatus).toBe('needs_review');
      expect(result.startTimestamp).toBe(60);
    });

    it('rejects severe hallucinations', () => {
      const quote = {
        text: 'we should definitely use a different database',
        whyItMatters: 'important',
        confidence: 0.9
      };
      const result = verifyQuote(quote, segments);
      expect(result.verificationStatus).toBe('rejected');
    });
  });
});
