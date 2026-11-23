import { describe, it, expect, afterEach } from "vitest";
import { AnalysisResultSchema, MAX_INSIGHTS, MAX_QUOTES, parseModelJson } from "./schema";
import { estimateCostUsd, getModelPrice } from "./pricing";

const quote = (i: number) => ({ text: `Quote number ${i} is here`, whyItMatters: "w", confidence: 0.8 });
const insight = (i: number) => ({ title: `T${i}`, explanation: "E", category: "c", importanceScore: 5, sourceSegments: [] });

describe("AnalysisResultSchema (lenient)", () => {
  it("trims over-long lists instead of failing the whole analysis", () => {
    const r = AnalysisResultSchema.parse({
      summary: "s",
      insights: Array.from({ length: 14 }, (_, i) => insight(i)),
      quotes: Array.from({ length: 22 }, (_, i) => quote(i)),
      topics: [],
      importantMoments: [],
      captionSuggestions: [],
    });
    expect(r.insights).toHaveLength(MAX_INSIGHTS);
    expect(r.quotes).toHaveLength(MAX_QUOTES);
  });

  it("repairs out-of-range numbers", () => {
    const r = AnalysisResultSchema.parse({
      summary: "s",
      insights: [{ ...insight(1), importanceScore: 0 }, { ...insight(2), importanceScore: "11" }],
      quotes: [{ ...quote(1), confidence: 85 }, { ...quote(2), confidence: "high" }, { ...quote(3), startTimestamp: -4 }],
      topics: [],
      importantMoments: [],
      captionSuggestions: [],
    });
    expect(r.insights.map((i) => i.importanceScore)).toEqual([1, 10]);
    expect(r.quotes.map((q) => q.confidence)).toEqual([0.85, 0.5, 0.8]);
    expect(r.quotes[2].startTimestamp).toBeUndefined();
  });

  it("drops a broken item without dropping the rest", () => {
    const r = AnalysisResultSchema.parse({
      summary: "s",
      insights: [insight(1), null, "junk"],
      quotes: [quote(1), 42],
      topics: [{ name: "AI" }, "Startups", 7],
      importantMoments: [{ title: "m", reason: "r" }],
      captionSuggestions: [{ text: "cap" }],
      // insights sometimes come back with "summary" instead of "explanation"
    });
    expect(r.insights).toHaveLength(1);
    expect(r.quotes).toHaveLength(1);
    expect(r.topics).toEqual(["AI", "Startups"]);
    expect(r.captionSuggestions).toEqual(["cap"]);
  });

  it("accepts insights that use summary instead of explanation", () => {
    const r = AnalysisResultSchema.parse({ summary: "s", insights: [{ title: "T", summary: "from summary", category: "c" }], quotes: [] });
    expect(r.insights[0].explanation).toBe("from summary");
    expect(r.insights[0].importanceScore).toBe(5);
  });

  it("still rejects an answer with nothing usable", () => {
    expect(AnalysisResultSchema.safeParse({ summary: "", insights: [], quotes: [] }).success).toBe(false);
    expect(AnalysisResultSchema.safeParse("nope").success).toBe(false);
  });
});

describe("parseModelJson", () => {
  it("parses fenced or wrapped JSON", () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('Here you go: {"a":2} thanks')).toEqual({ a: 2 });
  });
  it("throws a clear error on truncated JSON", () => {
    expect(() => parseModelJson('{"summary": "cut off')).toThrow(/not valid JSON/);
  });
});

describe("pricing", () => {
  afterEach(() => {
    delete process.env.AI_PRICE_INPUT_PER_M;
    delete process.env.AI_PRICE_OUTPUT_PER_M;
  });

  it("prices known models by prefix and aliases conservatively", () => {
    expect(getModelPrice("gemini-2.5-flash").input).toBe(0.3);
    expect(getModelPrice("gemini-2.5-flash-lite").input).toBe(0.1);
    expect(getModelPrice("models/gemini-3-flash-preview").output).toBe(3);
    expect(getModelPrice("gemini-flash-latest").output).toBe(7.5);
  });

  it("estimates cost with audio and thinking tokens", () => {
    // 1M text in at $0.30 + 1M audio at $1.00 + (0.5M out + 0.5M thinking) at $2.50
    const cost = estimateCostUsd("gemini-2.5-flash", {
      promptTokens: 2_000_000,
      audioPromptTokens: 1_000_000,
      outputTokens: 500_000,
      thoughtsTokens: 500_000,
    });
    expect(cost).toBeCloseTo(0.3 + 1 + 2.5, 6);
  });

  it("transcript analysis is far cheaper than video for the same conversation", () => {
    // 2-hour talk: ~35k transcript tokens vs ~100 tokens/s of low-res video+audio.
    const text = estimateCostUsd("gemini-2.5-flash", { promptTokens: 35_000, outputTokens: 5_000, thoughtsTokens: 1_000 });
    const video = estimateCostUsd("gemini-2.5-flash", { promptTokens: 720_000, audioPromptTokens: 230_000, outputTokens: 5_000, thoughtsTokens: 1_000 });
    expect(video / text).toBeGreaterThan(10);
  });

  it("honours env overrides", () => {
    process.env.AI_PRICE_INPUT_PER_M = "2";
    process.env.AI_PRICE_OUTPUT_PER_M = "0";
    expect(estimateCostUsd("gemini-2.5-flash", { promptTokens: 1_000_000, outputTokens: 1_000_000, thoughtsTokens: 0 })).toBe(2);
  });
});

describe("answers without importantMoments", () => {
  it("parse, with an empty list (the model is no longer asked for them)", () => {
    const parsed = AnalysisResultSchema.parse({
      summary: "A short talk about running.",
      insights: [],
      quotes: [{ text: "Showing up tired still counts as showing up.", startTimestamp: 415, whyItMatters: "True.", confidence: 0.9 }],
      topics: ["running"],
      captionSuggestions: [],
    });
    expect(parsed.importantMoments).toEqual([]);
    expect(parsed.quotes).toHaveLength(1);
  });
});
