"use server";

import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { consumeRateLimit } from "@/utils/rate-limit";
import { revalidatePath } from "next/cache";
import { track } from "@/utils/analytics/track";

const addSchema = z.object({
  postId: z.uuid(),
  content: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty.")
    .max(500, "Comment is too long (max 500 characters)."),
});

const deleteSchema = z.object({ commentId: z.uuid(), postId: z.uuid() });

export async function addComment(postId: string, content: string) {
  const parsed = addSchema.safeParse({ postId, content });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid comment." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return { error: "Guests cannot comment." };

  for (const action of ["comment", "comment_daily"] as const) {
    const limit = await consumeRateLimit(supabase, action);
    if (!limit.ok) return { error: limit.error };
  }

  // RLS also enforces this; checked here so the error is clear.
  const { data: post } = await supabase
    .from("posts")
    .select("id, visibility, user_id")
    .eq("id", parsed.data.postId)
    .maybeSingle();
  if (!post || (post.visibility !== "public" && post.user_id !== user.id)) {
    return { error: "Comments are only open on public posts." };
  }

  const { error } = await supabase.from("comments").insert({
    post_id: parsed.data.postId,
    user_id: user.id,
    content: parsed.data.content,
  });

  if (error) return { error: "Failed to add comment." };

  track(user.id, "comment_added", { post_id: parsed.data.postId });
  revalidatePath(`/discover/${parsed.data.postId}`);
  return { success: true };
}

export async function deleteComment(commentId: string, postId: string) {
  const parsed = deleteSchema.safeParse({ commentId, postId });
  if (!parsed.success) return { error: "Comment not found." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return { error: "Unauthorized." };

  const { data: deleted, error } = await supabase
    .from("comments")
    .delete()
    .eq("id", parsed.data.commentId)
    .eq("post_id", parsed.data.postId)
    .eq("user_id", user.id)
    .select("id");

  if (error) return { error: "Failed to delete comment." };
  if (!deleted || deleted.length === 0) return { error: "Comment not found." };

  revalidatePath(`/discover/${parsed.data.postId}`);
  return { success: true };
}
