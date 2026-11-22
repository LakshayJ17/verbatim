"use server";

/**
 * Admin server actions. Every action:
 *  1. validates its input with zod,
 *  2. re-checks the caller with requireAdmin() (never trusts the client),
 *  3. performs the change with the service role client,
 *  4. writes one row to public.admin_audit_log,
 *  5. revalidates the admin pages and returns { ok: true } or { error }.
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/utils/auth/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { GRAPHICS_BUCKET, ownedPathFromPublicUrl } from "@/utils/design/sharing";
import { removeUserGraphics } from "@/utils/design/storage-cleanup";
import {
  adminFeedbackSchema,
  adminIdSchema,
  adminReportStatusSchema,
} from "@/utils/moderation/admin-schemas";

export type AdminResult = { ok: true } | { error: string };

type Admin = SupabaseClient;

/** Ban long enough to be permanent until lifted (100 years). */
const SUSPEND_DURATION = "876000h";

async function audit(
  admin: Admin,
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown> = {}
) {
  const { error } = await admin.from("admin_audit_log").insert({
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
  if (error) console.error("[admin] audit log write failed:", error.message);
}

function revalidateAdmin(postId?: string) {
  revalidatePath("/admin", "layout");
  if (postId) {
    revalidatePath("/discover", "page");
    revalidatePath(`/discover/${postId}`, "page");
  }
}

/**
 * Takes a post down: 'unpublish' makes it private, 'delete' removes the post
 * row. Either way the public image is deleted from storage and the design's
 * rendered_image_url is cleared, mirroring app/actions/publish.ts but run
 * with the admin client. Returns an error message or null.
 */
async function takeDownPost(admin: Admin, postId: string, mode: "unpublish" | "delete") {
  const { data: post, error: loadError } = await admin
    .from("posts")
    .select("id, user_id, design_id, visibility, design:designs!design_id(id, rendered_image_url)")
    .eq("id", postId)
    .maybeSingle();
  if (loadError) return { error: "Could not load the post." };
  if (!post) return { error: "Post not found." };

  const design = (Array.isArray(post.design) ? post.design[0] : post.design) as
    | { id: string; rendered_image_url: string | null }
    | null;

  if (mode === "unpublish") {
    const { error } = await admin
      .from("posts")
      .update({ visibility: "private", updated_at: new Date().toISOString() })
      .eq("id", post.id);
    if (error) return { error: "Could not unpublish the post." };
  }

  let imageError: string | null = null;
  const path = ownedPathFromPublicUrl(design?.rendered_image_url, post.user_id);
  if (path) {
    const { error } = await admin.storage.from(GRAPHICS_BUCKET).remove([path]);
    if (error) imageError = error.message;
  }
  if (design?.rendered_image_url && !imageError) {
    await admin.from("designs").update({ rendered_image_url: null }).eq("id", design.id);
  }

  if (mode === "delete") {
    const { error } = await admin.from("posts").delete().eq("id", post.id);
    if (error) return { error: "Could not delete the post." };
  }

  return {
    post: { id: post.id as string, user_id: post.user_id as string, visibility: post.visibility as string },
    imageError,
  };
}

async function closeReportsFor(admin: Admin, adminId: string, targetType: string, targetId: string) {
  await admin
    .from("reports")
    .update({ status: "resolved", resolved_by: adminId, resolved_at: new Date().toISOString() })
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("status", "open");
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function adminSetReportStatus(reportId: string, status: string): Promise<AdminResult> {
  const input = z.object({ reportId: adminIdSchema, status: adminReportStatusSchema }).safeParse({ reportId, status });
  if (!input.success) return { error: "Invalid request." };

  const user = await requireAdmin();
  const admin = createAdminClient();

  const isOpen = input.data.status === "open";
  const { data, error } = await admin
    .from("reports")
    .update({
      status: input.data.status,
      resolved_by: isOpen ? null : user.id,
      resolved_at: isOpen ? null : new Date().toISOString(),
    })
    .eq("id", input.data.reportId)
    .select("id, target_type, target_id");
  if (error) return { error: "Could not update the report." };
  if (!data || data.length === 0) return { error: "Report not found." };

  await audit(admin, user.id, `report.${input.data.status}`, "report", input.data.reportId, {
    target_type: data[0].target_type,
    target_id: data[0].target_id,
  });
  revalidateAdmin();
  return { ok: true };
}

export async function adminRemoveReportedContent(reportId: string): Promise<AdminResult> {
  const input = adminIdSchema.safeParse(reportId);
  if (!input.success) return { error: "Invalid request." };

  const user = await requireAdmin();
  const admin = createAdminClient();

  const { data: report } = await admin
    .from("reports")
    .select("id, target_type, target_id")
    .eq("id", input.data)
    .maybeSingle();
  if (!report) return { error: "Report not found." };

  let postId: string | undefined;
  if (report.target_type === "post") {
    const res = await takeDownPost(admin, report.target_id, "unpublish");
    if ("error" in res) return { error: res.error as string };
    postId = res.post.id;
    await audit(admin, user.id, "post.unpublish", "post", report.target_id, {
      report_id: report.id,
      owner_id: res.post.user_id,
      image_error: res.imageError,
    });
    if (res.imageError) {
      await closeReportsFor(admin, user.id, "post", report.target_id);
      revalidateAdmin(postId);
      return { error: "The post is hidden, but its image could not be deleted. Try again from Posts." };
    }
  } else {
    const { data: comment } = await admin
      .from("comments")
      .select("id, post_id, user_id, content")
      .eq("id", report.target_id)
      .maybeSingle();
    if (comment) {
      const { error } = await admin.from("comments").delete().eq("id", comment.id);
      if (error) return { error: "Could not delete the comment." };
      postId = comment.post_id;
    }
    await audit(admin, user.id, "comment.delete", "comment", report.target_id, {
      report_id: report.id,
      owner_id: comment?.user_id ?? null,
      post_id: comment?.post_id ?? null,
      content: comment?.content?.slice(0, 500) ?? null,
      already_gone: !comment,
    });
  }

  await closeReportsFor(admin, user.id, report.target_type, report.target_id);
  revalidateAdmin(postId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export async function adminUnpublishPost(postId: string): Promise<AdminResult> {
  const input = adminIdSchema.safeParse(postId);
  if (!input.success) return { error: "Invalid request." };

  const user = await requireAdmin();
  const admin = createAdminClient();

  const res = await takeDownPost(admin, input.data, "unpublish");
  if ("error" in res) return { error: res.error as string };

  await audit(admin, user.id, "post.unpublish", "post", input.data, {
    owner_id: res.post.user_id,
    previous_visibility: res.post.visibility,
    image_error: res.imageError,
  });
  revalidateAdmin(input.data);
  if (res.imageError) return { error: "The post is hidden, but its image could not be deleted. Try again." };
  return { ok: true };
}

export async function adminDeletePost(postId: string): Promise<AdminResult> {
  const input = adminIdSchema.safeParse(postId);
  if (!input.success) return { error: "Invalid request." };

  const user = await requireAdmin();
  const admin = createAdminClient();

  const res = await takeDownPost(admin, input.data, "delete");
  if ("error" in res) return { error: res.error as string };

  await closeReportsFor(admin, user.id, "post", input.data);
  await audit(admin, user.id, "post.delete", "post", input.data, {
    owner_id: res.post.user_id,
    previous_visibility: res.post.visibility,
    image_error: res.imageError,
  });
  revalidateAdmin(input.data);
  if (res.imageError) return { error: "The post was deleted, but its image could not be removed from storage." };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function adminDeleteComment(commentId: string): Promise<AdminResult> {
  const input = adminIdSchema.safeParse(commentId);
  if (!input.success) return { error: "Invalid request." };

  const user = await requireAdmin();
  const admin = createAdminClient();

  const { data: comment } = await admin
    .from("comments")
    .select("id, post_id, user_id, content")
    .eq("id", input.data)
    .maybeSingle();
  if (!comment) return { error: "Comment not found." };

  const { error } = await admin.from("comments").delete().eq("id", comment.id);
  if (error) return { error: "Could not delete the comment." };

  await closeReportsFor(admin, user.id, "comment", comment.id);
  await audit(admin, user.id, "comment.delete", "comment", comment.id, {
    owner_id: comment.user_id,
    post_id: comment.post_id,
    content: comment.content?.slice(0, 500) ?? null,
  });
  revalidateAdmin(comment.post_id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function adminSuspendUser(userId: string): Promise<AdminResult> {
  const input = adminIdSchema.safeParse(userId);
  if (!input.success) return { error: "Invalid request." };

  const user = await requireAdmin();
  if (input.data === user.id) return { error: "You can't suspend your own account." };
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.updateUserById(input.data, { ban_duration: SUSPEND_DURATION });
  if (error) return { error: "Could not suspend the user." };

  await audit(admin, user.id, "user.suspend", "user", input.data, { ban_duration: SUSPEND_DURATION });
  revalidateAdmin();
  return { ok: true };
}

export async function adminUnsuspendUser(userId: string): Promise<AdminResult> {
  const input = adminIdSchema.safeParse(userId);
  if (!input.success) return { error: "Invalid request." };

  const user = await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.updateUserById(input.data, { ban_duration: "none" });
  if (error) return { error: "Could not lift the suspension." };

  await audit(admin, user.id, "user.unsuspend", "user", input.data);
  revalidateAdmin();
  return { ok: true };
}

export async function adminDeleteUser(userId: string): Promise<AdminResult> {
  const input = adminIdSchema.safeParse(userId);
  if (!input.success) return { error: "Invalid request." };

  const user = await requireAdmin();
  if (input.data === user.id) return { error: "You can't delete your own account here. Use Settings." };
  const admin = createAdminClient();

  const { data: target } = await admin.auth.admin.getUserById(input.data);
  if (!target?.user) return { error: "User not found." };

  // Storage is not covered by the FK cascade: remove the user's images first.
  const storageError = await removeUserGraphics(admin, input.data);
  if (storageError) return { error: "Could not delete the user's images. The user was not deleted." };

  const { error } = await admin.auth.admin.deleteUser(input.data);
  if (error) return { error: "Could not delete the user." };

  await audit(admin, user.id, "user.delete", "user", input.data, { email: target.user.email ?? null });
  revalidateAdmin();
  revalidatePath("/discover", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export async function adminSetFeedbackHandled(feedbackId: string, handled: boolean): Promise<AdminResult> {
  const input = adminFeedbackSchema.safeParse({ feedbackId, handled });
  if (!input.success) return { error: "Invalid request." };

  const user = await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("feedback")
    .update({ handled_at: input.data.handled ? new Date().toISOString() : null })
    .eq("id", input.data.feedbackId)
    .select("id");
  if (error) return { error: "Could not update the feedback." };
  if (!data || data.length === 0) return { error: "Feedback not found." };

  await audit(admin, user.id, input.data.handled ? "feedback.handled" : "feedback.reopened", "feedback", input.data.feedbackId);
  revalidateAdmin();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// System health
// ---------------------------------------------------------------------------

/**
 * Marks analyses stuck on "processing" for more than 10 minutes as failed,
 * so their owners can retry. A run can get stuck when the server process is
 * killed mid-analysis (deploys, platform timeouts).
 */
export async function adminFailStuckAnalyses(): Promise<AdminResult> {
  const user = await requireAdmin();
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("analyses")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("updated_at", cutoff)
    .select("id");
  if (error) return { error: "Could not update stuck analyses." };

  await audit(admin, user.id, "analysis.fail_stuck", "analysis", "bulk", { count: data?.length ?? 0, ids: (data ?? []).map((a) => a.id).slice(0, 50) });
  revalidateAdmin();
  return { ok: true };
}
