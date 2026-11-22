"use server";

import { createClient } from "@/utils/supabase/server";
import { removeUserGraphics } from "@/utils/design/storage-cleanup";
import { redirect } from "next/navigation";

/**
 * Self-service account deletion with the user's own session only (no service
 * role key):
 *  1. delete the user's images in public_graphics/posts/{uid}/ (storage
 *     policies allow owners to list and delete their own folder),
 *  2. call the delete_my_account() database function, which deletes
 *     auth.users WHERE id = auth.uid(); the FK cascade removes the profile and
 *     everything that belongs to it,
 *  3. sign out and go to the home page.
 */
export async function deleteAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) return { error: "Unauthorized" };

  try {
    const storageError = await removeUserGraphics(supabase, user.id);
    if (storageError) {
      console.error("Storage cleanup failed:", storageError);
      return { error: "Failed to delete your images. Your account was not deleted. Try again." };
    }

    const { error: deleteError } = await supabase.rpc("delete_my_account");
    if (deleteError) {
      console.error("Account deletion failed:", deleteError.message);
      return { error: "Failed to delete your account. Try again." };
    }

    // The auth user is gone; this clears the session cookies.
    await supabase.auth.signOut();
  } catch (error: unknown) {
    console.error("Account deletion error:", error);
    return { error: "Something went wrong while deleting your account. Try again." };
  }

  redirect("/");
}
