import Link from "next/link";
import { requireAdmin } from "@/utils/auth/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { adminDeleteComment } from "@/app/actions/admin";
import { AdminActionButton } from "@/components/admin/action-button";
import { AdminTime } from "@/components/admin/time";
import { AdminSearchForm } from "@/components/admin/search-form";
import { parseSearchQuery } from "@/utils/moderation/admin-schemas";

export const metadata = { title: "Comments" };

type Author = { username: string; full_name: string | null };
interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author: Author | Author[] | null;
}

export default async function AdminCommentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const q = parseSearchQuery((await searchParams).q);
  const admin = createAdminClient();

  let query = admin
    .from("comments")
    .select("id, post_id, user_id, content, created_at, author:profiles!user_id(username, full_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (q) query = query.ilike("content", `%${q}%`);

  const { data, error } = await query;
  const comments = (data ?? []) as CommentRow[];

  return (
    <div>
      <h1 className="heading-display text-3xl">Comments</h1>
      <p className="mt-2 text-muted-foreground">The 100 most recent comments.</p>

      <AdminSearchForm action="/admin/comments" label="Search comment text" defaultValue={q} />

      {error && <p role="alert" className="mt-6 text-destructive">Could not load comments: {error.message}</p>}
      {!error && comments.length === 0 && <p className="mt-6 text-muted-foreground">No comments found.</p>}

      <ul className="mt-6 space-y-4">
        {comments.map((c) => {
          const author = Array.isArray(c.author) ? c.author[0] ?? null : c.author;
          return (
            <li key={c.id} className="rounded-[var(--radius)] border border-border bg-card p-4">
              <p className="font-medium">
                {author ? author.full_name || `@${author.username}` : "Deleted user"}
                {author && <span className="font-normal text-muted-foreground"> @{author.username}</span>}
              </p>
              <p className="text-sm text-muted-foreground">
                <AdminTime value={c.created_at} />
                {" on "}
                <Link href={`/discover/${c.post_id}`} className="underline underline-offset-4">
                  this post
                </Link>
              </p>
              <p className="mt-2 break-words whitespace-pre-wrap">{c.content}</p>
              <div className="mt-3">
                <AdminActionButton
                  action={adminDeleteComment.bind(null, c.id)}
                  label="Delete comment"
                  confirmLabel="Confirm delete"
                  successMessage="Comment deleted."
                  variant="destructive"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
