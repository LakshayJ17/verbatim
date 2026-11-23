import { NormalizedSegment } from "../parsers";
import { QuoteExtraction } from "./schema";

/**
 * verified: quote matched deterministically against a real transcript
 * needs_review: fuzzy match of 80% or more; may be slightly paraphrased
 * rejected: no match; likely hallucinated
 * source_derived: no transcript was available; the quote comes from Gemini's
 *   direct video understanding and is not deterministically verified.
 *
 * The model never decides this status: whatever it claims, the status is
 * computed here from the stored transcript. That is the main defence against
 * a prompt injection that tries to get invented quotes published.
 */
export type VerificationStatus = "verified" | "needs_review" | "rejected" | "source_derived";

export interface VerifiedQuote extends QuoteExtraction {
  verificationStatus: VerificationStatus;
}

/**
 * Normalizes text for comparison by removing punctuation and making it lowercase.
 */
function normalizeForComparison(text: string): string {
  // Unicode-aware: keeps letters, combining marks (Devanagari vowel signs,
  // accents) and digits in every script, and drops punctuation. The old
  // ASCII-only \w pattern erased whole Hindi, Arabic or Chinese quotes,
  // which then "matched" any transcript.
  //
  // Two kinds of punctuation change meaning, so they are kept: apostrophes
  // ("we're" is not "were") and separators between digits ("1.5" is not
  // "15"). Curly and straight apostrophes count as the same.
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`\u00b4]/g, "'")
    .replace(/(\d)[.,](?=\d)/g, "$1\u00b7")
    .replace(/[^\p{L}\p{M}\p{N}\s'\u00b7]/gu, "")
    .replace(/(^|\s)'+|'+(?=\s|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

interface TranscriptIndex {
  /** Normalized words of the whole transcript, in order. */
  words: string[];
  /** For each word, the index of the segment it came from. */
  wordSegment: number[];
  /** words joined with single spaces. */
  joined: string;
}

function buildIndex(segments: NormalizedSegment[]): TranscriptIndex {
  const words: string[] = [];
  const wordSegment: number[] = [];
  segments.forEach((s, segIndex) => {
    const norm = normalizeForComparison(s.text ?? "");
    if (!norm) return;
    for (const w of norm.split(" ")) {
      words.push(w);
      wordSegment.push(segIndex);
    }
  });
  return { words, wordSegment, joined: words.join(" ") };
}

// Verifying 15 quotes against one transcript should build the index once.
const indexCache = new WeakMap<NormalizedSegment[], TranscriptIndex>();
function getIndex(segments: NormalizedSegment[]): TranscriptIndex {
  let idx = indexCache.get(segments);
  if (!idx) {
    idx = buildIndex(segments);
    indexCache.set(segments, idx);
  }
  return idx;
}

/** True when segments carry real timing (not a single plain-text blob). */
function hasTiming(segments: NormalizedSegment[]): boolean {
  return segments.length > 1 && segments.some((s) => (s.start ?? 0) > 0);
}

function withTiming(
  candidate: QuoteExtraction,
  segments: NormalizedSegment[],
  index: TranscriptIndex,
  firstWord: number,
  lastWord: number
): QuoteExtraction {
  if (!hasTiming(segments)) return candidate;
  const first = segments[index.wordSegment[firstWord]];
  const last = segments[index.wordSegment[Math.min(lastWord, index.words.length - 1)]];
  return {
    ...candidate,
    startTimestamp: first?.start ?? candidate.startTimestamp,
    endTimestamp: last?.end ?? last?.start ?? candidate.endTimestamp,
  };
}

/** Max occurrences of the first word to try when fuzzy matching. */
const MAX_FUZZY_STARTS = 300;

/**
 * Verifies a candidate quote deterministically against the raw transcript segments.
 * When the quote is found, its timestamps are replaced with the transcript's.
 */
export function verifyQuote(
  candidate: QuoteExtraction,
  segments: NormalizedSegment[]
): VerifiedQuote {
  const normCandidate = normalizeForComparison(candidate.text);

  // Nothing left to compare (empty or punctuation-only): never verified.
  if (!normCandidate) {
    return { ...candidate, verificationStatus: "rejected" };
  }
  // Emoji, circled letters and other symbols are ignored when comparing but
  // shown to readers, so a quote carrying them can't be called word for word.
  const best = verifyNormalized(candidate, normCandidate, segments);
  return best.verificationStatus === "verified" && SHOWN_BUT_NOT_COMPARED.test(candidate.text)
    ? { ...best, verificationStatus: "needs_review" }
    : best;
}

const SHOWN_BUT_NOT_COMPARED = /[\p{So}\p{Co}\p{Cn}]/u;

function verifyNormalized(
  candidate: QuoteExtraction,
  normCandidate: string,
  segments: NormalizedSegment[]
): VerifiedQuote {

  const index = getIndex(segments);
  const candidateWords = normCandidate.split(" ");

  // Exact match on whole words. Padding with spaces stops "ail is" from
  // matching inside "fail is".
  const padded = ` ${index.joined} `;
  const at = padded.indexOf(` ${normCandidate} `);
  if (at !== -1) {
    const firstWord = at === 0 ? 0 : (index.joined.slice(0, at).match(/ /g)?.length ?? 0);
    return {
      ...withTiming(candidate, segments, index, firstWord, firstWord + candidateWords.length - 1),
      verificationStatus: "verified",
    };
  }

  // Fuzzy: walk forward from each occurrence of the first word, allowing one
  // skipped or one inserted word at a time. Keep the best run.
  const transcriptWords = index.words;
  let bestMatched = 0;
  let bestStart = -1;
  let bestEnd = -1;
  let starts = 0;
  for (let s = transcriptWords.indexOf(candidateWords[0]); s !== -1 && starts < MAX_FUZZY_STARTS; s = transcriptWords.indexOf(candidateWords[0], s + 1)) {
    starts++;
    let matched = 0;
    let t = s;
    for (let i = 0; i < candidateWords.length; i++) {
      if (t < transcriptWords.length && candidateWords[i] === transcriptWords[t]) {
        matched++;
        t++;
      } else if (t + 1 < transcriptWords.length && candidateWords[i] === transcriptWords[t + 1]) {
        // Transcript has an extra filler word.
        matched++;
        t += 2;
      } else if (i + 1 < candidateWords.length && candidateWords[i + 1] === transcriptWords[t]) {
        // The model inserted a word: skip it without advancing the transcript.
      } else {
        break;
      }
    }
    if (matched > bestMatched) {
      bestMatched = matched;
      bestStart = s;
      bestEnd = t - 1;
      if (matched === candidateWords.length) break;
    }
  }

  const matchRatio = bestMatched / candidateWords.length;
  if (matchRatio >= 0.8 && bestStart !== -1) {
    return {
      ...withTiming(candidate, segments, index, bestStart, Math.max(bestStart, bestEnd)),
      verificationStatus: "needs_review",
    };
  }

  return { ...candidate, verificationStatus: "rejected" };
}

export function verifyQuotes(
  candidates: QuoteExtraction[],
  segments: NormalizedSegment[]
): VerifiedQuote[] {
  return candidates.map(q => verifyQuote(q, segments));
}

/**
 * When no transcript is available, mark all candidate quotes as source_derived.
 * These quotes came directly from Gemini's video understanding, so they are not
 * deterministically verified against a transcript.
 */
export function markAsSourceDerived(candidates: QuoteExtraction[]): VerifiedQuote[] {
  return candidates.map(q => ({ ...q, verificationStatus: "source_derived" as VerificationStatus }));
}

export function countByStatus(quotes: VerifiedQuote[]): Record<VerificationStatus, number> {
  const counts: Record<VerificationStatus, number> = { verified: 0, needs_review: 0, rejected: 0, source_derived: 0 };
  for (const q of quotes) counts[q.verificationStatus]++;
  return counts;
}
