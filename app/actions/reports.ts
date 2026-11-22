"use server";

import { createClient } from "@/utils/supabase/server";
import { consumeRateLimit } from "@/utils/rate-limit";
import { REPORT_MESSAGES, reportInputSchema } from "@/utils/moderation/reports";

type Result = { ok: true; message: string } | { error: string };

/**
 * Lets a signed-in, non-guest user report a post or a comment. Uses the
 * user's own session: the target must be visible to them through RLS (or be
 * an unlisted post they have the link to), and RLS on public.reports only
 * accepts rows where reporter_id = auth.uid().
 */
export async function reportContent(
  targetType: string,
  targetId: string,
  reason: string,
  details?: string
): Promise<Result> {
  const parsed = reportInputSchema.safeParse({ targetType, targetId, reason, details });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid report." };
  const input = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return { error: REPORT_MESSAGES.signIn };
  const limit = await consumeRateLimit(supabase, "report");
  if (!limit.ok) return { error: limit.error };

  // The target must exist and be visible to this user.
  let ownerId: string | null = null;
  if (input.targetType === "post") {
    const { data: post } = await supabase
      .from("posts")
      .select("id, user_id, visibility")
      .eq("id", input.targetId)
      .in("visibility", ["public", "unlisted"])
      .maybeSingle();
    if (post) {
      ownerId = post.user_id;
    } else {
      const { data: unlisted } = await supabase.rpc("get_unlisted_post", { p_id: input.targetId });
      const row = unlisted as { user_id?: string } | null;
      if (row?.user_id) ownerId = row.user_id;
    }
  } else {
    const { data: comment } = await supabase
      .from("comments")
      .select("id, user_id")
      .eq("id", input.targetId)
      .maybeSingle();
    if (comment) ownerId = comment.user_id;
  }

  if (!ownerId) return { error: REPORT_MESSAGES.notFound };
  if (ownerId === user.id) return { error: REPORT_MESSAGES.own };

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_type: input.targetType,
    target_id: input.targetId,
    reason: input.reason,
    details: input.details ?? null,
  });

  if (error) {
    if (error.code === "23505") return { error: REPORT_MESSAGES.duplicate };
    console.error("[reports] insert failed:", error.message);
    return { error: REPORT_MESSAGES.failed };
  }

  return { ok: true, message: REPORT_MESSAGES.thanks };
}
