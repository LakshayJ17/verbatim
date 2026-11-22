"use client";

/**
 * Client side of publishing a design, shared by the creator and the quote
 * gallery: render the design node to PNG, upload it to the signed URL the
 * server issued, then ask the server to finalize the post.
 *
 * All checks that matter (ownership, verified quote, storage path, file type)
 * happen on the server in app/actions/publish.ts. This module only moves bytes.
 */
import { saveDesign } from "@/app/actions/design";
import { preparePublication, finalizePublication } from "@/app/actions/publish";
import { createClient } from "@/utils/supabase/client";
import { exportDesignToPngBlob } from "./export";
import { FORMAT_PRESETS } from "./presets";
import { GRAPHICS_BUCKET } from "./sharing";
import type { DesignConfig, ContentType } from "./types";

export type PublishVisibility = "public" | "unlisted";

/** Renders the on-page design node to a full-size PNG blob. */
export function renderDesignBlob(canvasId: string, config: Pick<DesignConfig, "format">): Promise<Blob> {
  const preset = FORMAT_PRESETS[config.format];
  return exportDesignToPngBlob(canvasId, preset.width, preset.height);
}

/** Publishes an already saved design. Throws an Error with a user-facing message on failure. */
export async function publishSavedDesign({
  designId,
  canvasId,
  config,
  visibility,
}: {
  designId: string;
  canvasId: string;
  config: Pick<DesignConfig, "format">;
  visibility: PublishVisibility;
}): Promise<{ postId: string }> {
  const prep = await preparePublication(designId);
  if ("error" in prep && prep.error) throw new Error(prep.error);
  if (!("path" in prep) || !prep.path || !prep.token) throw new Error("Could not prepare the upload. Try again.");

  const blob = await renderDesignBlob(canvasId, config);

  const supabase = createClient();
  const { error: uploadError } = await supabase.storage
    .from(GRAPHICS_BUCKET)
    .uploadToSignedUrl(prep.path, prep.token, blob, { contentType: "image/png", upsert: false });
  if (uploadError) throw new Error("Could not upload the image. Try again.");

  const result = await finalizePublication(designId, prep.path, visibility);
  if ("error" in result && result.error) throw new Error(result.error);
  if (!("postId" in result) || !result.postId) throw new Error("Could not publish. Try again.");
  return { postId: result.postId };
}

/** Saves the design (unless `designId` is given) and publishes it. Returns both ids. */
export async function saveAndPublishDesign({
  content,
  config,
  canvasId,
  visibility,
  designId,
}: {
  content: { type: ContentType; id: string };
  config: DesignConfig;
  canvasId: string;
  visibility: PublishVisibility;
  designId?: string | null;
}): Promise<{ designId: string; postId: string }> {
  let id = designId ?? null;
  if (!id) {
    const saved = await saveDesign({
      quote_id: content.type === "quote" ? content.id : undefined,
      insight_id: content.type === "insight" ? content.id : undefined,
      configuration: config,
    });
    if (saved.error || !saved.id) throw new Error(saved.error ?? "Could not save the design.");
    id = saved.id;
  }
  const { postId } = await publishSavedDesign({ designId: id, canvasId, config, visibility });
  return { designId: id, postId };
}

/** Absolute link to a post, for copying or sharing. */
export function postUrl(postId: string): string {
  return new URL(`/discover/${postId}`, window.location.origin).toString();
}

/** Triggers a browser download of a blob. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
