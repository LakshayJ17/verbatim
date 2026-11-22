"use server";

import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { DesignConfig } from "@/utils/design/types";
import { FORMAT_PRESETS, type FormatPresetId } from "@/utils/design/presets";
import { DESIGN_STYLES, type StyleId } from "@/utils/design/styles";
import { revalidatePath } from "next/cache";
import { track } from "@/utils/analytics/track";

const colour = z.string().max(64).regex(/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|[a-z]+)$/i);
const font = z.string().max(200).regex(/^[\w\s,"'-]+$/);

const configSchema = z.object({
  format: z.enum(Object.keys(FORMAT_PRESETS) as [FormatPresetId, ...FormatPresetId[]]),
  style: z.enum(Object.keys(DESIGN_STYLES) as [StyleId, ...StyleId[]]),
  palette: z.object({ background: colour, text: colour, accent: colour, muted: colour }),
  typography: z.object({
    quoteFont: font,
    sourceFont: font,
    weight: z.union([z.number().int().min(100).max(1000), z.string().max(16)]),
    alignment: z.enum(["left", "center", "right"]),
  }),
  // Content is replaced with the stored quote or insight below; it is only shape-checked here.
  content: z.object({
    type: z.enum(["quote", "insight"]),
    text: z.string().max(5000),
    sourceTitle: z.string().max(500),
    speakerName: z.string().max(200).optional(),
  }),
  showAttribution: z.boolean(),
  showSource: z.boolean(),
  rendererVersion: z.number().int().min(1).max(100),
});

const saveSchema = z
  .object({
    quote_id: z.uuid().optional(),
    insight_id: z.uuid().optional(),
    configuration: configSchema,
  })
  .refine((v) => Boolean(v.quote_id) !== Boolean(v.insight_id), "Provide exactly one of quote_id or insight_id");

interface SaveDesignParams {
  quote_id?: string;
  insight_id?: string;
  configuration: DesignConfig;
}

/**
 * Saves a design for a quote or insight the user owns. The text, speaker and
 * source title stored in the configuration always come from the database, so
 * a saved design can't misquote its source.
 */
export async function saveDesign(params: SaveDesignParams): Promise<{ id: string; error?: undefined } | { id?: undefined; error: string }> {
  const parsed = saveSchema.safeParse(params);
  if (!parsed.success) return { error: "That design could not be saved. Refresh and try again." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Sign in to save designs." };
  if (user.is_anonymous) return { error: "Guests can't save designs. Create an account to save and share." };

  const { quote_id, insight_id, configuration } = parsed.data;
  let content: DesignConfig["content"];

  if (quote_id) {
    const { data: quote } = await supabase
      .from("quotes")
      .select("user_id, text, speaker_name, verification_status, analyses(sources(title, creator_name))")
      .eq("id", quote_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!quote || quote.user_id !== user.id) return { error: "Quote not found." };
    if (quote.verification_status === "rejected") return { error: "This quote was not found in the transcript, so it can't be used." };
    const source = pickSource(quote.analyses);
    content = {
      type: "quote",
      text: quote.text,
      speakerName: quote.speaker_name || source?.creator_name || undefined,
      sourceTitle: source?.title || "Unknown source",
    };
  } else {
    const { data: insight } = await supabase
      .from("insights")
      .select("user_id, summary, analyses(sources(title))")
      .eq("id", insight_id!)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!insight || insight.user_id !== user.id) return { error: "Insight not found." };
    content = {
      type: "insight",
      text: insight.summary ?? "",
      sourceTitle: pickSource(insight.analyses)?.title || "Unknown source",
    };
  }

  const { data, error } = await supabase
    .from("designs")
    .insert({
      user_id: user.id,
      quote_id: quote_id ?? null,
      insight_id: insight_id ?? null,
      configuration: { ...configuration, content },
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[design] save failed:", error?.code, error?.message);
    return { error: "Failed to save design." };
  }

  track(user.id, "design_saved", {
    design_id: data.id,
    type: content.type,
    style: configuration.style,
    format: configuration.format,
  });
  revalidatePath("/library");
  return { id: data.id as string };
}

/** Supabase returns embedded relations as an object or a one-item array depending on the FK shape. */
function pickSource(analyses: unknown): { title?: string; creator_name?: string } | undefined {
  const a = Array.isArray(analyses) ? analyses[0] : analyses;
  const s = a && typeof a === "object" ? (a as { sources?: unknown }).sources : undefined;
  const src = Array.isArray(s) ? s[0] : s;
  return src && typeof src === "object" ? (src as { title?: string; creator_name?: string }) : undefined;
}
