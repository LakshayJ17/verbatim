/**
 * Cost estimates for Gemini calls, used for the admin usage dashboard and the
 * daily budget guard. Prices are USD per 1M tokens (standard tier, prompts
 * under 200k tokens) from https://ai.google.dev/gemini-api/docs/pricing as of
 * November 2026. They are ESTIMATES: check them against your Google billing
 * and override with AI_PRICE_INPUT_PER_M / AI_PRICE_AUDIO_PER_M /
 * AI_PRICE_OUTPUT_PER_M when they change.
 *
 * Aliases like "gemini-flash-latest" can be repointed by Google to a newer,
 * pricier model without notice, so they are priced at the most expensive
 * current Flash tier. Pin AI_MODEL to an exact model to keep costs predictable.
 */

export interface ModelPrice {
  /** Text, image and video input. */
  input: number;
  /** Audio input (video files carry an audio track billed at this rate). */
  audio: number;
  /** Output, including thinking tokens. */
  output: number;
}

// Matched by prefix, most specific first.
const PRICES: Array<[prefix: string, price: ModelPrice]> = [
  ["gemini-3.8-flash", { input: 1.5, audio: 3.0, output: 7.5 }],
  ["gemini-3.6-flash", { input: 1.5, audio: 3.0, output: 7.5 }],
  ["gemini-3.5-flash-lite", { input: 0.25, audio: 0.5, output: 1.5 }],
  ["gemini-3.1-flash-lite", { input: 0.25, audio: 0.5, output: 1.5 }],
  ["gemini-3-flash", { input: 0.5, audio: 1.0, output: 3.0 }],
  ["gemini-2.5-flash-lite", { input: 0.1, audio: 0.3, output: 0.4 }],
  ["gemini-2.5-flash", { input: 0.3, audio: 1.0, output: 2.5 }],
  ["gemini-2.5-pro", { input: 1.25, audio: 1.25, output: 10.0 }],
];

/** Conservative default for aliases and unknown models. */
const FALLBACK_PRICE: ModelPrice = { input: 1.5, audio: 3.0, output: 7.5 };

function envNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function getModelPrice(model: string): ModelPrice {
  const name = model.toLowerCase().replace(/^models\//, "");
  const base = PRICES.find(([prefix]) => name.startsWith(prefix))?.[1] ?? FALLBACK_PRICE;
  return {
    input: envNumber("AI_PRICE_INPUT_PER_M") ?? base.input,
    audio: envNumber("AI_PRICE_AUDIO_PER_M") ?? base.audio,
    output: envNumber("AI_PRICE_OUTPUT_PER_M") ?? base.output,
  };
}

export interface TokenUsage {
  promptTokens: number;
  /** Portion of promptTokens that was audio (billed at the audio rate). */
  audioPromptTokens?: number;
  /** Portion of promptTokens served from the context cache (billed at ~10%). */
  cachedTokens?: number;
  outputTokens: number;
  thoughtsTokens: number;
}

/** Estimated USD cost of one call. Rounded to 6 decimals. */
export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const price = getModelPrice(model);
  const audio = Math.max(0, usage.audioPromptTokens ?? 0);
  const cached = Math.max(0, usage.cachedTokens ?? 0);
  const otherInput = Math.max(0, usage.promptTokens - audio - cached);
  const cost =
    (otherInput * price.input + audio * price.audio + cached * price.input * 0.1) / 1_000_000 +
    ((usage.outputTokens + usage.thoughtsTokens) * price.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Optional flat cost per transcript provider call (SUPADATA_COST_PER_CALL_USD). */
export function transcriptCallCostUsd(): number {
  return envNumber("SUPADATA_COST_PER_CALL_USD") ?? 0;
}
