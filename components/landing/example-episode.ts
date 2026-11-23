import type { NormalizedSegment } from "@/utils/parsers";
import { verifyQuote, type VerificationStatus } from "@/utils/ai/verification";

/**
 * An invented interview used on the landing page to show how Verbatim works.
 * Nothing here is a real person or show.
 */
export const EPISODE = {
  show: "The Slow Lane",
  episode: "Episode 18",
  guest: "Maren Okafor",
  host: "Dev Raman",
  length: "52:30",
};

export const TRANSCRIPT: NormalizedSegment[] = [
  { start: 400, end: 404, speaker: "Dev Raman", text: "What changed when you stopped chasing personal bests?" },
  { start: 404, end: 409, speaker: "Maren Okafor", text: "I started enjoying the boring runs." },
  { start: 409, end: 415, speaker: "Maren Okafor", text: "Most of my training is meant to feel easy." },
  { start: 415, end: 421, speaker: "Maren Okafor", text: "Showing up tired still counts as showing up." },
  { start: 421, end: 428, speaker: "Maren Okafor", text: "The hard days only work if the easy days stay easy." },
  { start: 428, end: 430, speaker: "Dev Raman", text: "That sounds simple." },
  { start: 430, end: 436, speaker: "Maren Okafor", text: "It is. Simple is not the same as easy." },
  { start: 436, end: 444, speaker: "Maren Okafor", text: "I write down every bad run, because it tells me what I changed." },
];

export const QUOTES: { text: string; start: number; status: VerificationStatus }[] = [
  { text: "Showing up tired still counts as showing up.", start: 415, status: "verified" },
  { text: "I write down every bad run, because it tells me what I changed.", start: 436, status: "verified" },
  { text: "Hard days only work if the easy days are easy.", start: 421, status: "needs_review" },
];

export const INSIGHTS = [
  {
    category: "Consistency",
    title: "Showing up beats a perfect plan",
    summary: "Maren counts tired, slow runs as wins because they keep the habit alive.",
  },
  {
    category: "Practice",
    title: "Bad runs are data",
    summary: "She logs every bad run to see what she changed that day.",
  },
  {
    category: "Training",
    title: "Keep the easy days easy",
    summary: "Hard sessions only pay off when the days around them stay gentle.",
  },
];

export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Same normalisation as utils/ai/verification.ts, used only to locate the match.
function normalize(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface CheckResult {
  status: VerificationStatus;
  segment?: NormalizedSegment;
}

/**
 * Runs the product's own verifyQuote against the example transcript, then
 * finds the transcript line where the match starts so the page can show it.
 */
export function checkAgainstExample(text: string): CheckResult | null {
  if (!normalize(text)) return null;

  const { verificationStatus } = verifyQuote({ text, whyItMatters: "", confidence: 1 }, TRANSCRIPT);
  if (verificationStatus === "rejected") return { status: verificationStatus };

  // Word offset at which each segment starts in the joined transcript.
  const offsets: number[] = [];
  let count = 0;
  for (const seg of TRANSCRIPT) {
    offsets.push(count);
    count += normalize(seg.text).split(" ").length;
  }

  const full = normalize(TRANSCRIPT.map((s) => s.text).join(" "));
  const candidate = normalize(text);
  let wordIndex: number;
  if (verificationStatus === "verified") {
    wordIndex = full.slice(0, full.indexOf(candidate)).split(" ").length - 1;
  } else {
    wordIndex = full.split(" ").indexOf(candidate.split(" ")[0]);
  }

  let segIndex = 0;
  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i] <= wordIndex) segIndex = i;
  }
  return { status: verificationStatus, segment: TRANSCRIPT[segIndex] };
}
