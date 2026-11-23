"use server";

import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { consumeRateLimit, consumeNetworkLimit, RATE_LIMITS } from "@/utils/rate-limit";

/** Owner notification emails per hour, across everyone, so a flood can't empty the inbox or the Resend quota. */
const MAX_EMAILS_PER_HOUR = 10;

const FeedbackSchema = z.object({
  message: z.string().trim().min(5, "Please write at least a few words.").max(2000, "Please keep it under 2,000 characters."),
  email: z
    .string()
    .trim()
    .max(254)
    .email("That email address does not look right.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  page: z.string().trim().max(200).optional(),
  // Honeypot: real people never see or fill this field.
  website: z.string().max(0).optional().or(z.literal("")),
});

export type FeedbackState = { ok: boolean; error?: string };

/**
 * Stores feedback and, when RESEND_API_KEY and FEEDBACK_TO_EMAIL are set,
 * emails it to the owner. The email step never blocks a successful save.
 */
export async function sendFeedback(_prev: FeedbackState, formData: FormData): Promise<FeedbackState> {
  const parsed = FeedbackSchema.safeParse({
    message: formData.get("message") ?? "",
    email: formData.get("email") ?? "",
    page: formData.get("page") ?? undefined,
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }
  // Bots that fill the honeypot get a quiet success and nothing is stored.
  if (parsed.data.website) return { ok: true };

  const { message, email, page } = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Members: per-account limit. Visitors and guests (who can make new guest
  // accounts at will): per-network limit.
  const member = user && !user.is_anonymous;
  if (member) {
    const limit = await consumeRateLimit(supabase, "feedback");
    if (!limit.ok) return { ok: false, error: limit.error };
  } else if (!(await consumeNetworkLimit("feedback_visitor"))) {
    return { ok: false, error: RATE_LIMITS.feedback.message };
  }

  // Written with the service role after the checks above: browsers can't
  // insert feedback directly (see the 20261123100000 migration).
  const admin = createAdminClient();
  const { error } = await admin.from("feedback").insert({
    message,
    email: email ?? null,
    page: page ?? null,
    user_id: member ? user.id : null,
  });
  if (error) {
    console.error("[feedback] insert failed:", error.message);
    return { ok: false, error: "We could not send your feedback. Please try again in a minute." };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_TO_EMAIL;
  const { count: lastHour } = await admin
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if (apiKey && to && (lastHour ?? 0) <= MAX_EMAILS_PER_HOUR) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.FEEDBACK_FROM_EMAIL || "Verbatim feedback <onboarding@resend.dev>",
          to: [to],
          reply_to: email || undefined,
          subject: "New Verbatim feedback",
          text: `${message}\n\nFrom: ${email || "no email given"}\nPage: ${page || "unknown"}`,
        }),
      });
      if (!res.ok) console.error("[feedback] email failed:", res.status);
    } catch (e) {
      console.error("[feedback] email failed:", e instanceof Error ? e.message : e);
    }
  }

  return { ok: true };
}
