"use server";

import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { USERNAME_RE } from "@/utils/auth/username";
import { consumeRateLimit } from "@/utils/rate-limit";

// Every field is untrusted client input. Before this, any string (spaces,
// slashes, 10k characters) could be saved as a username and broke
// /profile/[username] links.
const profileSchema = z.object({
  full_name: z.string().trim().max(100, "Name is too long.").optional(),
  bio: z.string().trim().max(500, "Bio is too long (max 500 characters).").optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_RE, "Usernames are 3-30 characters: letters, numbers and underscores.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function updateProfile(data: { full_name?: string; bio?: string; username?: string }) {
  const parsed = profileSchema.safeParse(data ?? {});
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid profile." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) return { error: "Unauthorized" };

  const limit = await consumeRateLimit(supabase, "profile_update");
  if (!limit.ok) return { error: limit.error };

  const { full_name, bio, username } = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .update({
      ...(full_name !== undefined ? { full_name } : {}),
      ...(bio !== undefined ? { bio } : {}),
      ...(username ? { username } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === '23505') {
      return { error: "Username is already taken." };
    }
    return { error: "Failed to update profile." };
  }

  const path = username ? `/profile/${username}` : `/profile/${user.id}`;
  revalidatePath(path);
  return { success: true, newUsername: username };
}
