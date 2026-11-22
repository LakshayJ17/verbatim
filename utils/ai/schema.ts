import { z } from "zod";

/**
 * Model output schemas.
 *
 * These are deliberately forgiving. The old schema rejected the whole answer
 * when the model returned 11 insights, a confidence of 85 instead of 0.85, or
 * an importance score of 0, so a paid analysis failed for a cosmetic reason.
 * Now each field is coerced or clamped, a malformed item is dropped on its
 * own, and lists are trimmed to their caps. Only a response with no usable
 * structure at all is rejected.
 */

const text = z.preprocess((v) => (v == null ? "" : typeof v === "string" ? v : String(v)), z.string());
const optionalText = z.preprocess(
  (v) => (v == null || v === "" ? undefined : typeof v === "string" ? v : String(v)),
  z.string().optional()
);
const optionalSeconds = z.preprocess((v) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
}, z.number().optional());

/** 0..1. Accepts percentages (85 -> 0.85). Missing or junk -> 0.5. */
const confidence = z.preprocess((v) => {
  const raw = typeof v === "string" ? Number(v) : v;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0.5;
  let n = raw;
  if (n > 1 && n <= 100) n = n / 100;
  return Math.min(1, Math.max(0, n));
}, z.number().min(0).max(1));

/** Integer 1..10. Missing or junk -> 5. */
const importance = z.preprocess((v) => {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return 5;
  return Math.min(10, Math.max(1, Math.round(n)));
}, z.number().int().min(1).max(10));

export const QuoteSchema = z.object({
  text: z.string().describe("The exact transcribed text of the quote."),
  speaker: z.string().optional().describe("The name of the speaker, if identifiable."),
  startTimestamp: z.number().optional().describe("The start timestamp in seconds."),
  endTimestamp: z.number().optional().describe("The end timestamp in seconds."),
  whyItMatters: z.string().describe("Why this quote is important or impactful."),
  confidence: z.number().min(0).max(1).describe("Confidence score of the extraction between 0 and 1."),
});

export const InsightSchema = z.object({
  title: z.string(),
  explanation: z.string(),
  category: z.string(),
  importanceScore: z.number().int().min(1).max(10),
  sourceSegments: z.array(z.number()),
});

export const ImportantMomentSchema = z.object({
  title: z.string(),
  startTimestamp: z.number().optional(),
  endTimestamp: z.number().optional(),
  reason: z.string(),
});

const LenientQuote = z.object({
  text: text,
  speaker: optionalText,
  startTimestamp: optionalSeconds,
  endTimestamp: optionalSeconds,
  whyItMatters: text,
  confidence,
});

const LenientInsight = z.object({
  title: text,
  // Some answers use "summary" or "description" instead of "explanation".
  explanation: text,
  category: text,
  importanceScore: importance,
  sourceSegments: z.preprocess(
    (v) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n) && n >= 0) : []),
    z.array(z.number())
  ),
});

const LenientMoment = z.object({
  title: text,
  startTimestamp: optionalSeconds,
  endTimestamp: optionalSeconds,
  reason: text,
});

/** Parses each item on its own; a broken item is dropped instead of failing the list. */
function lenientList<T extends z.ZodTypeAny>(item: T, max: number, prepare?: (v: unknown) => unknown) {
  return z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.unknown())).transform((items) => {
    const out: z.infer<T>[] = [];
    for (const raw of items) {
      const parsed = item.safeParse(prepare ? prepare(raw) : raw);
      if (parsed.success) out.push(parsed.data);
      if (out.length >= max) break;
    }
    return out;
  });
}

const stringList = (max: number) =>
  z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.unknown())).transform((items) =>
    items
      .map((v) =>
        typeof v === "string"
          ? v
          : v && typeof v === "object" && "name" in v
            ? String((v as { name: unknown }).name ?? "")
            : v && typeof v === "object" && "text" in v
              ? String((v as { text: unknown }).text ?? "")
              : ""
      )
      .filter((s) => s.trim().length > 0)
      .slice(0, max)
  );

export const MAX_INSIGHTS = 10;
export const MAX_QUOTES = 15;

export const AnalysisResultSchema = z
  .object({
    summary: text,
    insights: lenientList(LenientInsight, MAX_INSIGHTS, (raw) => {
      if (raw && typeof raw === "object" && !("explanation" in raw)) {
        const r = raw as Record<string, unknown>;
        return { ...r, explanation: r.summary ?? r.description ?? "" };
      }
      return raw;
    }),
    quotes: lenientList(LenientQuote, MAX_QUOTES),
    topics: stringList(20),
    importantMoments: lenientList(LenientMoment, 20),
    captionSuggestions: stringList(10),
  })
  .refine((r) => r.summary.trim().length > 0 || r.quotes.length > 0 || r.insights.length > 0, {
    message: "The model returned no summary, quotes or insights.",
  });

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type QuoteExtraction = z.infer<typeof QuoteSchema>;
export type InsightExtraction = z.infer<typeof InsightSchema>;
export type ImportantMomentExtraction = z.infer<typeof ImportantMomentSchema>;

/**
 * Extracts a JSON object from model text: tolerates ```json fences and text
 * around the object. Throws a clear error when there is no JSON.
 */
export function parseModelJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new Error("The model's answer was not valid JSON.");
  }
}
