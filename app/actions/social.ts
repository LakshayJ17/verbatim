"use server";

import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { consumeRateLimit } from "@/utils/rate-limit";
import { revalidatePath } from "next/cache";
import { track } from "@/utils/analytics/track";

const idSchema = z.uuid();

async function getMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user: user && !user.is_anonymous ? user : null };
}

/**
 * likes and bookmarks have a composite primary key (user_id, post_id) and no
 * id column, so rows are matched on both columns. RLS only allows liking or
 * bookmarking posts that are public or your own.
 */
async function toggleRow(table: "likes" | "bookmarks", postId: string, userId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: existing } = await supabase
    .from(table)
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from(table).delete().eq("post_id", postId).eq("user_id", userId)
    : await supabase.from(table).insert({ post_id: postId, user_id: userId });
  return { error, added: !existing };
}

export async function toggleLike(postId: string) {
  const parsed = idSchema.safeParse(postId);
  if (!parsed.success) return { error: "Post not found." };
  const { supabase, user } = await getMember();
  if (!user) return { error: "Guests cannot like posts." };
  const limit = await consumeRateLimit(supabase, "like");
  if (!limit.ok) return { error: limit.error };

  const { error, added } = await toggleRow("likes", parsed.data, user.id, supabase);
  if (error) return { error: "Could not update the like." };
  if (added) track(user.id, "post_liked", { post_id: parsed.data });

  revalidatePath("/discover");
  return { success: true };
}

export async function toggleBookmark(postId: string) {
  const parsed = idSchema.safeParse(postId);
  if (!parsed.success) return { error: "Post not found." };
  const { supabase, user } = await getMember();
  if (!user) return { error: "Guests cannot bookmark posts." };
  const limit = await consumeRateLimit(supabase, "bookmark");
  if (!limit.ok) return { error: limit.error };

  const { error, added } = await toggleRow("bookmarks", parsed.data, user.id, supabase);
  if (error) return { error: "Could not update the bookmark." };
  if (added) track(user.id, "post_bookmarked", { post_id: parsed.data });

  revalidatePath("/discover");
  revalidatePath("/bookmarks");
  return { success: true };
}

export async function toggleFollow(followingId: string) {
  const parsed = idSchema.safeParse(followingId);
  if (!parsed.success) return { error: "Profile not found." };
  const { supabase, user } = await getMember();
  if (!user) return { error: "Guests cannot follow users." };
  if (user.id === parsed.data) return { error: "Cannot follow yourself." };
  const limit = await consumeRateLimit(supabase, "follow");
  if (!limit.ok) return { error: limit.error };

  const { data: existing } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", user.id)
    .eq("following_id", parsed.data)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", parsed.data)
    : await supabase.from("follows").insert({ follower_id: user.id, following_id: parsed.data });
  if (error) return { error: "Could not update follow." };
  if (!existing) track(user.id, "user_followed", { following_id: parsed.data });

  revalidatePath(`/profile/${parsed.data}`);
  return { success: true };
}
