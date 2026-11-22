import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/utils/auth/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { adminDeletePost, adminUnpublishPost } from "@/app/actions/admin";
import { AdminActionButton } from "@/components/admin/action-button";
import { AdminTime } from "@/components/admin/time";
import { AdminSearchForm } from "@/components/admin/search-form";
import { parseSearchQuery } from "@/utils/moderation/admin-schemas";

export const metadata = { title: "Posts" };

interface PostRow {
  id: string;
  user_id: string;
  caption: string | null;
  visibility: string;
  created_at: string;
  author: { username: string; full_name: string | null } | Array<{ username: string; full_name: string | null }> | null;
  design: { rendered_image_url: string | null } | Array<{ rendered_image_url: string | null }> | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const q = parseSearchQuery((await searchParams).q);
  const admin = createAdminClient();

  let query = admin
    .from("posts")
    .select(
      "id, user_id, caption, visibility, created_at, author:profiles!user_id(username, full_name), design:designs!design_id(rendered_image_url)"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (q) {
    const { data: authors } = await admin
      .from("profiles")
      .select("id")
      .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(100);
    const ids = (authors ?? []).map((a) => a.id as string);
    query = ids.length
      ? query.or(`caption.ilike.%${q}%,user_id.in.(${ids.join(",")})`)
      : query.ilike("caption", `%${q}%`);
  }

  const { data, error } = await query;
  const posts = (data ?? []) as PostRow[];

  return (
    <div>
      <h1 className="heading-display text-3xl">Posts</h1>
      <p className="mt-2 text-muted-foreground">The 50 most recent posts of any visibility.</p>

      <AdminSearchForm action="/admin/posts" label="Search by caption or author" defaultValue={q} />

      {error && <p role="alert" className="mt-6 text-destructive">Could not load posts: {error.message}</p>}
      {!error && posts.length === 0 && <p className="mt-6 text-muted-foreground">No posts found.</p>}

      <ul className="mt-6 space-y-4">
        {posts.map((p) => {
          const author = one(p.author);
          const image = one(p.design)?.rendered_image_url ?? null;
          return (
            <li key={p.id} className="flex flex-col gap-4 rounded-[var(--radius)] border border-border bg-card p-4 sm:flex-row">
              {image ? (
                <Image
                  src={image}
                  alt="Post image"
                  width={96}
                  height={96}
                  className="size-24 shrink-0 rounded-[var(--radius)] bg-muted object-cover"
                />
              ) : (
                <div className="flex size-24 shrink-0 items-center justify-center rounded-[var(--radius)] bg-muted p-2 text-center text-sm text-muted-foreground">
                  No image
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium">
                  {author ? author.full_name || `@${author.username}` : "Deleted user"}
                  {author && <span className="font-normal text-muted-foreground"> @{author.username}</span>}
                </p>
                <p className="text-sm text-muted-foreground">
                  Visibility: {p.visibility}. Created <AdminTime value={p.created_at} />
                </p>
                {p.caption && <p className="break-words">{p.caption}</p>}
                {p.visibility !== "private" && (
                  <p>
                    <Link href={`/discover/${p.id}`} className="underline underline-offset-4">
                      View post
                    </Link>
                  </p>
                )}
                <div className="flex flex-wrap gap-3 pt-2">
                  {(p.visibility !== "private" || image) && (
                    <AdminActionButton
                      action={adminUnpublishPost.bind(null, p.id)}
                      label="Unpublish"
                      confirmLabel="Confirm unpublish"
                      successMessage="Post unpublished and image deleted."
                    />
                  )}
                  <AdminActionButton
                    action={adminDeletePost.bind(null, p.id)}
                    label="Delete post"
                    confirmLabel="Confirm delete"
                    successMessage="Post deleted."
                    variant="destructive"
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
