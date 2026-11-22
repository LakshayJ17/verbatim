import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/utils/auth/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { adminRemoveReportedContent, adminSetReportStatus } from "@/app/actions/admin";
import { AdminActionButton } from "@/components/admin/action-button";
import { AdminTime } from "@/components/admin/time";
import { parseReportStatusFilter } from "@/utils/moderation/admin-schemas";
import { reportReasonLabel } from "@/utils/moderation/reports";

export const metadata = { title: "Reports" };

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
] as const;

const STATUS_ORDER: Record<string, number> = { open: 0, resolved: 1, dismissed: 2 };

interface ReportRow {
  id: string;
  reporter_id: string | null;
  target_type: "post" | "comment";
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const status = parseReportStatusFilter((await searchParams).status);
  const admin = createAdminClient();

  let query = admin
    .from("reports")
    .select("id, reporter_id, target_type, target_id, reason, details, status, created_at, resolved_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  const reports = ((data ?? []) as ReportRow[]).sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
  );

  const postIds = [...new Set(reports.filter((r) => r.target_type === "post").map((r) => r.target_id))];
  const commentIds = [...new Set(reports.filter((r) => r.target_type === "comment").map((r) => r.target_id))];

  const [postsRes, commentsRes] = await Promise.all([
    postIds.length
      ? admin
          .from("posts")
          .select("id, caption, visibility, user_id, design:designs!design_id(rendered_image_url)")
          .in("id", postIds)
      : Promise.resolve({ data: [] as never[] }),
    commentIds.length
      ? admin.from("comments").select("id, content, post_id, user_id").in("id", commentIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  type PostPreview = { id: string; caption: string | null; visibility: string; user_id: string; image: string | null };
  const posts = new Map<string, PostPreview>();
  for (const p of (postsRes.data ?? []) as Array<Record<string, unknown>>) {
    const design = (Array.isArray(p.design) ? p.design[0] : p.design) as { rendered_image_url?: string | null } | null;
    posts.set(p.id as string, {
      id: p.id as string,
      caption: (p.caption as string | null) ?? null,
      visibility: p.visibility as string,
      user_id: p.user_id as string,
      image: design?.rendered_image_url ?? null,
    });
  }
  type CommentPreview = { id: string; content: string; post_id: string; user_id: string };
  const comments = new Map<string, CommentPreview>();
  for (const c of (commentsRes.data ?? []) as CommentPreview[]) comments.set(c.id, c);

  const profileIds = [
    ...new Set(
      [
        ...reports.map((r) => r.reporter_id),
        ...[...posts.values()].map((p) => p.user_id),
        ...[...comments.values()].map((c) => c.user_id),
      ].filter((v): v is string => !!v)
    ),
  ];
  const { data: profileRows } = profileIds.length
    ? await admin.from("profiles").select("id, username, full_name").in("id", profileIds)
    : { data: [] };
  const names = new Map<string, string>();
  for (const p of (profileRows ?? []) as Array<{ id: string; username: string; full_name: string | null }>) {
    names.set(p.id, p.full_name ? `${p.full_name} (@${p.username})` : `@${p.username}`);
  }
  const nameOf = (id: string | null) => (id ? names.get(id) ?? "Deleted user" : "Deleted user");

  return (
    <div>
      <h1 className="heading-display text-3xl">Reports</h1>

      <nav aria-label="Filter reports by status" className="mt-4">
        <ul className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <li key={f.value}>
              <Link
                href={`/admin/reports?status=${f.value}`}
                aria-current={status === f.value ? "page" : undefined}
                className={`inline-flex h-10 items-center rounded-[var(--radius)] border border-border px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  status === f.value ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"
                }`}
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {error && <p role="alert" className="mt-6 text-destructive">Could not load reports: {error.message}</p>}
      {!error && reports.length === 0 && <p className="mt-6 text-muted-foreground">No reports here.</p>}

      <ul className="mt-6 space-y-4">
        {reports.map((r) => {
          const post = r.target_type === "post" ? posts.get(r.target_id) : undefined;
          const comment = r.target_type === "comment" ? comments.get(r.target_id) : undefined;
          const gone = !post && !comment;
          const ownerId = post?.user_id ?? comment?.user_id ?? null;
          return (
            <li key={r.id} className="rounded-[var(--radius)] border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold">
                  {r.target_type === "post" ? "Post" : "Comment"}: {reportReasonLabel(r.reason)}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {r.status === "open" ? "Open" : r.status === "resolved" ? "Resolved" : "Dismissed"},
                  reported <AdminTime value={r.created_at} />
                </p>
              </div>

              <div className="mt-3 flex gap-4">
                {post?.image && (
                  <Image
                    src={post.image}
                    alt="Reported post image"
                    width={96}
                    height={96}
                    className="size-24 shrink-0 rounded-[var(--radius)] bg-muted object-cover"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-1 text-base">
                  {post && (
                    <>
                      <p>
                        {post.visibility !== "private" && (
                          <>
                            <Link href={`/discover/${post.id}`} className="underline underline-offset-4">
                              View post
                            </Link>{" "}
                          </>
                        )}
                        <span className="text-muted-foreground">Visibility: {post.visibility}</span>
                      </p>
                      {post.caption && <p className="break-words">{post.caption}</p>}
                    </>
                  )}
                  {comment && (
                    <>
                      <blockquote className="border-l-2 border-border pl-3 break-words whitespace-pre-wrap">
                        {comment.content}
                      </blockquote>
                      <p>
                        <Link href={`/discover/${comment.post_id}`} className="underline underline-offset-4">
                          View post
                        </Link>
                      </p>
                    </>
                  )}
                  {gone && <p className="text-muted-foreground">This content has already been removed.</p>}
                  {ownerId && <p className="text-sm text-muted-foreground">Author: {nameOf(ownerId)}</p>}
                  <p className="text-sm text-muted-foreground">Reported by: {nameOf(r.reporter_id)}</p>
                  {r.details && (
                    <p className="text-sm break-words whitespace-pre-wrap">
                      <span className="text-muted-foreground">Details: </span>
                      {r.details}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {r.status === "open" ? (
                  <>
                    {!gone && (
                      <AdminActionButton
                        action={adminRemoveReportedContent.bind(null, r.id)}
                        label={r.target_type === "post" ? "Remove post" : "Remove comment"}
                        confirmLabel="Confirm remove"
                        successMessage="Content removed and report resolved."
                        variant="destructive"
                      />
                    )}
                    <AdminActionButton
                      action={adminSetReportStatus.bind(null, r.id, "resolved")}
                      label="Resolve"
                      successMessage="Report resolved."
                    />
                    <AdminActionButton
                      action={adminSetReportStatus.bind(null, r.id, "dismissed")}
                      label="Dismiss"
                      successMessage="Report dismissed."
                    />
                  </>
                ) : (
                  <AdminActionButton
                    action={adminSetReportStatus.bind(null, r.id, "open")}
                    label="Reopen"
                    successMessage="Report reopened."
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
