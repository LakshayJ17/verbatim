"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { FORMAT_PRESETS, type FormatPresetId } from "@/utils/design/presets";
import { pngSize } from "@/utils/design/png";
import { consumeRateLimit } from "@/utils/rate-limit";
import { revalidatePath } from "next/cache";
import { track } from "@/utils/analytics/track";
import {
  GRAPHICS_BUCKET,
  buildGraphicPath,
  isGraphicPathFor,
  ownedPathFromPublicUrl,
  publicPostBlockReason,
  type VerificationStatus,
} from "@/utils/design/sharing";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const idSchema = z.uuid();
const publishVisibilitySchema = z.enum(["public", "unlisted"]);
const pathSchema = z.string().min(1).max(512);

/** Max size we accept for an uploaded graphic. Mirrors the bucket limit in the sharing_security migration. */
const MAX_GRAPHIC_BYTES = 10 * 1024 * 1024;

async function getMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return { supabase, user: null };
  return { supabase, user };
}

/** Loads a design only if it belongs to `userId`. */
async function getOwnedDesign(supabase: Supabase, designId: string, userId: string) {
  const { data } = await supabase
    .from("designs")
    .select("id, user_id, quote_id, insight_id, rendered_image_url, configuration")
    .eq("id", designId)
    .eq("user_id", userId)
    .maybeSingle();
  return data && data.user_id === userId ? data : null;
}

/**
 * Server-side publish rule: quote designs need a verified quote, insight
 * designs are allowed. Returns an error message, or null when allowed.
 */
async function publishBlockReason(
  supabase: Supabase,
  design: { quote_id: string | null; insight_id: string | null },
  userId: string
): Promise<string | null> {
  if (design.quote_id) {
    const { data: quote } = await supabase
      .from("quotes")
      .select("verification_status, user_id")
      .eq("id", design.quote_id)
      .maybeSingle();
    if (!quote || (quote.user_id && quote.user_id !== userId)) return "Original quote not found.";
    return publicPostBlockReason(quote.verification_status as VerificationStatus);
  }
  if (design.insight_id) {
    const { data: insight } = await supabase
      .from("insights")
      .select("id")
      .eq("id", design.insight_id)
      .maybeSingle();
    return insight ? null : "Original insight not found.";
  }
  return "Content is not eligible for publication.";
}

/** Removes a design's graphic from storage, but only if it sits in this user's folder. */
async function removeOwnedGraphic(supabase: Supabase, url: string | null | undefined, userId: string) {
  const path = ownedPathFromPublicUrl(url, userId);
  if (!path) return;
  const { error } = await supabase.storage.from(GRAPHICS_BUCKET).remove([path]);
  if (error) console.error("[publish] could not remove graphic:", error.message);
}

function revalidateSharing(userId: string, postId?: string) {
  revalidatePath("/discover", "page");
  revalidatePath(`/profile/${userId}`, "page");
  if (postId) revalidatePath(`/discover/${postId}`, "page");
}

/**
 * Step 1 of publishing: checks ownership and the publish rule, then issues a
 * signed upload URL for a path generated here (posts/{uid}/{designId}-{uuid}.png).
 */
export async function preparePublication(designId: string) {
  const parsedId = idSchema.safeParse(designId);
  if (!parsedId.success) return { error: "Design not found." };

  const { supabase, user } = await getMember();
  if (!user) return { error: "Sign in with an account to publish. Guests can't publish." };

  const design = await getOwnedDesign(supabase, parsedId.data, user.id);
  if (!design) return { error: "Design not found." };

  const blocked = await publishBlockReason(supabase, design, user.id);
  if (blocked) return { error: blocked };

  const limit = await consumeRateLimit(supabase, "publish");
  if (!limit.ok) return { error: limit.error };

  const path = buildGraphicPath(user.id, design.id, randomUUID());

  // Issued with the service role: browsers have no upload rights of their
  // own on this bucket (20261123100000 migration), only this one-time URL.
  const { data: signedUpload, error: signedError } = await createAdminClient()
    .storage.from(GRAPHICS_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (signedError || !signedUpload) {
    console.error("[publish] signed upload URL failed:", signedError?.message);
    return { error: "Could not prepare the upload. Try again." };
  }

  return { path, token: signedUpload.token };
}

/**
 * Step 2 of publishing: verifies the uploaded object is this user's PNG for
 * this design, links it to the design and creates or updates the post.
 */
export async function finalizePublication(designId: string, path: string, visibility: "public" | "unlisted" = "public") {
  const input = z
    .object({ designId: idSchema, path: pathSchema, visibility: publishVisibilitySchema })
    .safeParse({ designId, path, visibility });
  if (!input.success) return { error: "Invalid publish request." };

  const { supabase, user } = await getMember();
  if (!user) return { error: "Sign in with an account to publish." };

  if (!isGraphicPathFor(input.data.path, user.id, input.data.designId)) {
    return { error: "Invalid storage path." };
  }

  const design = await getOwnedDesign(supabase, input.data.designId, user.id);
  if (!design) return { error: "Design not found." };

  // Re-check: the quote's status could have changed since step 1, and step 1 can be skipped by a crafted client.
  const blocked = await publishBlockReason(supabase, design, user.id);
  if (blocked) return { error: blocked };

  // The upload must be a real PNG (checked from its bytes, not the declared
  // type) of exactly this design's size, within the size limit. The image
  // itself is still drawn in the browser, so this can't prove what it says;
  // reports and moderation cover that.
  const admin = createAdminClient();
  const { data: file, error: downloadError } = await admin.storage.from(GRAPHICS_BUCKET).download(input.data.path);
  if (downloadError || !file) return { error: "The image upload did not finish. Try again." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = pngSize(bytes);
  const preset = FORMAT_PRESETS[((design.configuration ?? {}) as { format?: FormatPresetId }).format ?? "square"];
  if (bytes.length > MAX_GRAPHIC_BYTES || !size || !preset || size.width !== preset.width || size.height !== preset.height) {
    await admin.storage.from(GRAPHICS_BUCKET).remove([input.data.path]);
    return { error: "The uploaded image was not accepted." };
  }

  const imageUrl = admin.storage.from(GRAPHICS_BUCKET).getPublicUrl(input.data.path).data.publicUrl;
  const previousUrl = design.rendered_image_url;

  // Only the server sets this column (browsers lost UPDATE on designs).
  const { error: designError } = await admin
    .from("designs")
    .update({ rendered_image_url: imageUrl })
    .eq("id", design.id)
    .eq("user_id", user.id);
  if (designError) {
    console.error("[publish] design image update failed:", designError.code, designError.message);
    return { error: "Failed to finalize design." };
  }

  if (previousUrl && previousUrl !== imageUrl) {
    await removeOwnedGraphic(supabase, previousUrl, user.id);
  }

  const { data: existingPost } = await supabase
    .from("posts")
    .select("id")
    .eq("design_id", design.id)
    .eq("user_id", user.id)
    .maybeSingle();

  let postId: string;
  if (existingPost) {
    const { error: updateError } = await supabase
      .from("posts")
      .update({ visibility: input.data.visibility, updated_at: new Date().toISOString() })
      .eq("id", existingPost.id)
      .eq("user_id", user.id);
    if (updateError) {
      console.error("[publish] post update failed:", updateError.code, updateError.message);
      return { error: "Failed to update publication status." };
    }
    postId = existingPost.id;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("posts")
      .insert({ user_id: user.id, design_id: design.id, visibility: input.data.visibility })
      .select("id")
      .single();
    if (insertError || !inserted) {
      console.error("[publish] post insert failed:", insertError?.code, insertError?.message);
      return { error: "Failed to publish post." };
    }
    postId = inserted.id;
  }

  track(user.id, "post_published", {
    post_id: postId,
    design_id: design.id,
    visibility: input.data.visibility,
    republish: Boolean(existingPost),
  });
  revalidateSharing(user.id, postId);
  return { success: true as const, postId };
}

/**
 * Takes a design out of Discover: the post becomes private and the public
 * image is deleted from storage. Likes and comments stay attached to the
 * private post, so republishing keeps them.
 */
export async function unpublishDesign(designId: string) {
  const parsedId = idSchema.safeParse(designId);
  if (!parsedId.success) return { error: "Design not found." };

  const { supabase, user } = await getMember();
  if (!user) return { error: "Unauthorized." };

  const design = await getOwnedDesign(supabase, parsedId.data, user.id);
  if (!design) return { error: "Design not found." };

  const { data: post } = await supabase
    .from("posts")
    .select("id")
    .eq("design_id", design.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (post) {
    const { error } = await supabase
      .from("posts")
      .update({ visibility: "private", updated_at: new Date().toISOString() })
      .eq("id", post.id)
      .eq("user_id", user.id);
    if (error) return { error: "Failed to unpublish." };
  }

  await removeOwnedGraphic(supabase, design.rendered_image_url, user.id);
  if (design.rendered_image_url) {
    await createAdminClient().from("designs").update({ rendered_image_url: null }).eq("id", design.id).eq("user_id", user.id);
  }

  track(user.id, "post_unpublished", { post_id: post?.id ?? null, design_id: design.id });
  revalidateSharing(user.id, post?.id);
  return { success: true as const };
}

export async function deletePost(postId: string) {
  const parsedId = idSchema.safeParse(postId);
  if (!parsedId.success) return { error: "Post not found." };

  const { supabase, user } = await getMember();
  if (!user) return { error: "Unauthorized." };

  const { data: post } = await supabase
    .from("posts")
    .select("id, design_id, user_id")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!post || post.user_id !== user.id) return { error: "Post not found." };

  const { error } = await supabase.from("posts").delete().eq("id", post.id).eq("user_id", user.id);
  if (error) return { error: "Failed to delete post." };

  const design = await getOwnedDesign(supabase, post.design_id, user.id);
  if (design?.rendered_image_url) {
    await removeOwnedGraphic(supabase, design.rendered_image_url, user.id);
    await createAdminClient().from("designs").update({ rendered_image_url: null }).eq("id", design.id).eq("user_id", user.id);
  }

  revalidateSharing(user.id, post.id);
  return { success: true as const };
}
