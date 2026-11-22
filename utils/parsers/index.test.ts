import { describe, it, expect } from 'vitest';
import { parseTxt, parseSrt, parseVtt, parseTranscript } from './index';

describe('Transcript Parsers', () => {
  describe('TXT Parser', () => {
    it('treats the entire content as a single segment', () => {
      const content = "Hello world.\nThis is a test transcript.\nIt has no timestamps.";
      const result = parseTxt(content);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        start: 0,
        end: 0,
        text: "Hello world.\nThis is a test transcript.\nIt has no timestamps.",
      });
    });

    it('handles empty TXT', () => {
      expect(parseTxt("  \n  ")).toHaveLength(0);
    });
  });

  describe('SRT Parser', () => {
    it('parses basic SRT format', () => {
      const content = `
1
00:00:01,000 --> 00:00:04,500
Hello there!

2
00:00:05,000 --> 00:00:08,000
How are you?
      `;
      const result = parseSrt(content);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ start: 1, end: 4.5, text: "Hello there!" });
      expect(result[1]).toMatchObject({ start: 5, end: 8, text: "How are you?" });
    });

    it('extracts speakers from text', () => {
      const content = `
1
00:00:00,000 --> 00:00:05,000
Interviewer: What is your name?

2
00:00:05,000 --> 00:00:10,000
Guest: My name is Alice.
`;
      const result = parseSrt(content);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ speaker: "Interviewer", text: "What is your name?" });
      expect(result[1]).toMatchObject({ speaker: "Guest", text: "My name is Alice." });
    });

    it('handles malformed or missing indices gracefully', () => {
      const content = `
00:00:01,000 --> 00:00:02,000
Missing index here

00:00:03,000 --> 00:00:04,000
Another missing index
`;
      const result = parseSrt(content);
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe("Missing index here");
      expect(result[1].text).toBe("Another missing index");
    });
  });

  describe('VTT Parser', () => {
    it('parses basic VTT format', () => {
      const content = `WEBVTT

00:00.000 --> 00:04.500
Hello there!

00:05.000 --> 00:08.000
How are you?`;
      const result = parseVtt(content);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ start: 0, end: 4.5, text: "Hello there!" });
      expect(result[1]).toMatchObject({ start: 5, end: 8, text: "How are you?" });
    });

    it('extracts speakers using <v Speaker> tag', () => {
      const content = `WEBVTT

00:00:00.000 --> 00:00:05.000
<v Interviewer>What is your name?

00:00:05.000 --> 00:00:10.000
<v Guest>My name is Alice.`;
      const result = parseVtt(content);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ speaker: "Interviewer", text: "What is your name?" });
      expect(result[1]).toMatchObject({ speaker: "Guest", text: "My name is Alice." });
    });

    it('strips internal HTML tags', () => {
      const content = `WEBVTT

00:00.000 --> 00:02.000
This is <b>bold</b> and <i>italic</i>.`;
      const result = parseVtt(content);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("This is bold and italic.");
    });
  });

  describe('parseTranscript Dispatcher', () => {
    it('routes correctly based on type', () => {
      const result = parseTranscript("Hello", "txt");
      expect(result).toHaveLength(1);
    });
    
    it('throws on unsupported types', () => {
      // @ts-expect-error testing invalid type
      expect(() => parseTranscript("Hello", "csv")).toThrow();
    });
  });
});
