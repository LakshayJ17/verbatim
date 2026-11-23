import { describe, expect, it } from "vitest";
import { endsInLoop } from "./loop-guard";

const NORMAL_ANSWER = JSON.stringify(
  {
    summary: "A compilation of the most chaotic moments from the series, built on misunderstandings and absurd excuses.",
    insights: [
      { title: "Absurdist comedy", explanation: "The humour relies on illogical reactions.", category: "Entertainment", importanceScore: 8, sourceSegments: [50, 92] },
      { title: "Character dynamics", explanation: "Nobody seems grounded in reality.", category: "Characters", importanceScore: 7, sourceSegments: [145, 247] },
    ],
    quotes: [
      { text: "Showing up tired still counts as showing up.", startTimestamp: 415, endTimestamp: 421, whyItMatters: "Short and true.", confidence: 0.9 },
      { text: "Ha ha ha, no, no, no, that is not what I meant at all.", startTimestamp: 430, whyItMatters: "Funny.", confidence: 0.75 },
    ],
    topics: ["comedy", "family", "friendship"],
    captionSuggestions: ["Sameer being Sameer.", "The chaos is unmatched."],
  },
  null,
  2
);

describe("endsInLoop", () => {
  it("leaves a normal answer alone, at every point while it streams in", () => {
    for (let end = 1; end <= NORMAL_ANSWER.length; end += 7) {
      expect(endsInLoop(NORMAL_ANSWER.slice(0, end))).toBe(false);
    }
    expect(endsInLoop(NORMAL_ANSWER)).toBe(false);
  });

  it("catches a number that never ends", () => {
    expect(endsInLoop(`${NORMAL_ANSWER.slice(0, 400)}"confidence": 0.95${"0".repeat(300)}`)).toBe(true);
  });

  it("catches a whitespace run", () => {
    expect(endsInLoop(`${NORMAL_ANSWER.slice(0, 400)}${" ".repeat(260)}`)).toBe(true);
    expect(endsInLoop(`${NORMAL_ANSWER.slice(0, 400)}${"\n".repeat(260)}`)).toBe(true);
  });

  it("catches a phrase repeated over and over", () => {
    expect(endsInLoop(`${NORMAL_ANSWER.slice(0, 400)}${"tera baap, ".repeat(30)}`)).toBe(true);
    expect(endsInLoop(`"sourceSegments": [${"50, ".repeat(80)}`)).toBe(true);
  });

  it("ignores short repeats a real quote can contain", () => {
    expect(endsInLoop(`${NORMAL_ANSWER.slice(0, 400)}"text": "No, no, no, no, no, no, no, no!"`)).toBe(false);
    expect(endsInLoop(`${NORMAL_ANSWER.slice(0, 400)}"text": "${"ha ".repeat(40)}"`)).toBe(false);
  });
});
