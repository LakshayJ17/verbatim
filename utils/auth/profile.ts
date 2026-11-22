import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import { baseUsername, usernameCandidate } from "./username";
import { track } from "@/utils/analytics/track";

/**
 * Makes sure `user` has a profiles row and returns true when it exists.
 *
 * The handle_new_user trigger (20261121 migration) creates profiles inside
 * the database for every new auth user. This is the application-side safety
 * net for accounts created before that migration, or if it isn't applied:
 * it runs with the service role (so RLS and guest restrictions can't block
 * it) and retries on a duplicate username instead of failing silently.
 */
export async function ensureProfile(user: Pick<User, "id" | "email" | "is_anonymous" | "user_metadata">): Promise<boolean> {
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error("[profile] service role not configured:", e instanceof Error ? e.message : e);
    return false;
  }

  const { data: existing, error: readError } = await admin.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (existing) return true;
  if (readError) {
    console.error("[profile] lookup failed:", readError.message);
    return false;
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = String(meta.full_name ?? meta.name ?? (user.is_anonymous ? "Guest User" : "")).slice(0, 100);
  const base = user.is_anonymous
    ? "guest"
    : baseUsername((meta.user_name as string) || (meta.preferred_username as string) || fullName || user.email);
  const avatar = typeof meta.avatar_url === "string" ? meta.avatar_url : null;

  for (let attempt = 0; attempt < 6; attempt++) {
    const username = user.is_anonymous ? `guest_${user.id.replace(/-/g, "").slice(0, 8 + attempt * 2)}` : usernameCandidate(base, attempt);
    const { error } = await admin.from("profiles").insert({
      id: user.id,
      username,
      full_name: fullName,
      avatar_url: avatar,
    });
    if (!error) {
      if (!user.is_anonymous) track(user.id, "signed_up", { via: "app" });
      return true;
    }
    if (error.code !== "23505") {
      console.error("[profile] insert failed:", error.message);
      return false;
    }
    // 23505: either the username was taken (retry) or the row was created
    // concurrently by the trigger or another request (done).
    const { data: raced } = await admin.from("profiles").select("id").eq("id", user.id).maybeSingle();
    if (raced) return true;
  }
  console.error("[profile] could not find a free username for", user.id);
  return false;
}
