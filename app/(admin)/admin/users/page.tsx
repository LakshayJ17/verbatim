import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { requireAdmin } from "@/utils/auth/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { adminDeleteUser, adminSuspendUser, adminUnsuspendUser } from "@/app/actions/admin";
import { AdminActionButton } from "@/components/admin/action-button";
import { AdminTime } from "@/components/admin/time";
import { AdminSearchForm } from "@/components/admin/search-form";
import { isBanned, parsePage, parseSearchQuery } from "@/utils/moderation/admin-schemas";
import { isAdminUser } from "@/utils/auth/roles";

export const metadata = { title: "Users" };

const PER_PAGE = 50;
/** Search scans at most this many users (auth.admin.listUsers has no server-side search). */
const SEARCH_PAGE_SIZE = 1000;
const SEARCH_MAX_PAGES = 10;
const SEARCH_MAX_RESULTS = 100;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const q = parseSearchQuery(sp.q);
  const page = parsePage(sp.page);
  const admin = createAdminClient();

  let users: User[] = [];
  let loadError: string | null = null;
  let hasNext = false;

  if (q) {
    const needle = q.toLowerCase();
    const { data: matches } = await admin
      .from("profiles")
      .select("id")
      .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(SEARCH_MAX_RESULTS);
    const profileMatches = new Set((matches ?? []).map((m) => m.id as string));

    for (let p = 1; p <= SEARCH_MAX_PAGES && users.length < SEARCH_MAX_RESULTS; p++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: p, perPage: SEARCH_PAGE_SIZE });
      if (error) {
        loadError = error.message;
        break;
      }
      for (const u of data.users) {
        if (profileMatches.has(u.id) || (u.email ?? "").toLowerCase().includes(needle) || u.id === q) users.push(u);
      }
      if (data.users.length < SEARCH_PAGE_SIZE) break;
    }
    users = users.slice(0, SEARCH_MAX_RESULTS);
  } else {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) loadError = error.message;
    else {
      users = data.users;
      hasNext = data.users.length === PER_PAGE;
    }
  }

  const ids = users.map((u) => u.id);
  const [{ data: profiles }, { data: postRows }] = ids.length
    ? await Promise.all([
        admin.from("profiles").select("id, username, full_name").in("id", ids),
        admin.from("posts").select("user_id").in("user_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const profileById = new Map(
    ((profiles ?? []) as Array<{ id: string; username: string; full_name: string | null }>).map((p) => [p.id, p])
  );
  const postCounts = new Map<string, number>();
  for (const r of (postRows ?? []) as Array<{ user_id: string }>) {
    postCounts.set(r.user_id, (postCounts.get(r.user_id) ?? 0) + 1);
  }

  return (
    <div>
      <h1 className="heading-display text-3xl">Users</h1>

      <AdminSearchForm action="/admin/users" label="Search by email, username or name" defaultValue={q} />

      {loadError && <p role="alert" className="mt-6 text-destructive">Could not load users: {loadError}</p>}
      {!loadError && users.length === 0 && <p className="mt-6 text-muted-foreground">No users found.</p>}

      <ul className="mt-6 space-y-4">
        {users.map((u) => {
          const profile = profileById.get(u.id);
          const banned = isBanned(u.banned_until);
          const isMe = u.id === me.id;
          return (
            <li key={u.id} className="rounded-[var(--radius)] border border-border bg-card p-4">
              <p className="font-medium break-all">
                {u.email ?? (u.is_anonymous ? "Guest account" : "No email")}
                {isAdminUser(u) && <span className="font-normal text-muted-foreground"> (admin)</span>}
                {isMe && <span className="font-normal text-muted-foreground"> (you)</span>}
              </p>
              <p className="text-sm text-muted-foreground">
                {profile ? (
                  <Link href={`/profile/${profile.username}`} className="underline underline-offset-4">
                    @{profile.username}
                  </Link>
                ) : (
                  "No profile"
                )}
                {profile?.full_name ? `, ${profile.full_name}` : ""}
              </p>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex gap-2"><dt className="text-muted-foreground">Joined</dt><dd><AdminTime value={u.created_at} /></dd></div>
                <div className="flex gap-2"><dt className="text-muted-foreground">Last sign in</dt><dd><AdminTime value={u.last_sign_in_at} /></dd></div>
                <div className="flex gap-2"><dt className="text-muted-foreground">Posts</dt><dd className="tabular-nums">{postCounts.get(u.id) ?? 0}</dd></div>
                <div className="flex gap-2"><dt className="text-muted-foreground">Status</dt><dd>{banned ? "Suspended" : "Active"}</dd></div>
              </dl>
              {!isMe && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {banned ? (
                    <AdminActionButton
                      action={adminUnsuspendUser.bind(null, u.id)}
                      label="Unsuspend"
                      successMessage="Suspension lifted."
                    />
                  ) : (
                    <AdminActionButton
                      action={adminSuspendUser.bind(null, u.id)}
                      label="Suspend"
                      confirmLabel="Confirm suspend"
                      successMessage="User suspended."
                    />
                  )}
                  <AdminActionButton
                    action={adminDeleteUser.bind(null, u.id)}
                    label="Delete user"
                    confirmLabel="Confirm delete"
                    successMessage="User and their images deleted."
                    variant="destructive"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {!q && (page > 1 || hasNext) && (
        <nav aria-label="Pages" className="mt-6 flex gap-3">
          {page > 1 && (
            <Link
              href={`/admin/users?page=${page - 1}`}
              className="inline-flex h-10 items-center rounded-[var(--radius)] border border-border bg-card px-3 hover:bg-muted"
            >
              Previous page
            </Link>
          )}
          {hasNext && (
            <Link
              href={`/admin/users?page=${page + 1}`}
              className="inline-flex h-10 items-center rounded-[var(--radius)] border border-border bg-card px-3 hover:bg-muted"
            >
              Next page
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
