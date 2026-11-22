/**
 * Deletes every graphic in a user's folder of the graphics bucket
 * (public_graphics/posts/{userId}/). Takes any Supabase client:
 *  - the user's own session client for self-service account deletion (storage
 *    policies let owners list and delete their own folder),
 *  - the admin client in admin code paths.
 * Returns an error message, or null when the folder is empty.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { GRAPHICS_BUCKET, isUuid } from "./sharing";

const PAGE = 100;
const MAX_PASSES = 1000;

export async function removeUserGraphics(client: SupabaseClient, userId: string): Promise<string | null> {
  if (!isUuid(userId)) return "Invalid user id.";
  const folder = `posts/${userId}`;
  const bucket = client.storage.from(GRAPHICS_BUCKET);

  // list() returns at most `limit` entries. Each pass removes what it listed,
  // so offset stays at 0 until the folder is empty.
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const { data: entries, error: listError } = await bucket.list(folder, { limit: PAGE, offset: 0 });
    if (listError) return listError.message || "Could not list files.";

    // Sub-folder entries have no id; uploads are never nested, so skip them.
    const files = (entries ?? []).filter((f) => f.id !== null && f.name);
    if (files.length === 0) return null;

    const { error: removeError } = await bucket.remove(files.map((f) => `${folder}/${f.name}`));
    if (removeError) return removeError.message || "Could not delete files.";

    if ((entries ?? []).length < PAGE) return null;
  }
  return "Too many files to delete in one go.";
}
