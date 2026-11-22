import { requireAdmin } from "@/utils/auth/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { adminSetFeedbackHandled } from "@/app/actions/admin";
import { AdminActionButton } from "@/components/admin/action-button";
import { AdminTime } from "@/components/admin/time";

export const metadata = { title: "Feedback" };

interface FeedbackRow {
  id: string;
  message: string;
  email: string | null;
  page: string | null;
  user_id: string | null;
  created_at: string;
  handled_at: string | null;
}

export default async function AdminFeedbackPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("feedback")
    .select("id, message, email, page, user_id, created_at, handled_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as FeedbackRow[];

  const userIds = [...new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v))];
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, username").in("id", userIds)
    : { data: [] };
  const usernames = new Map(((profiles ?? []) as Array<{ id: string; username: string }>).map((p) => [p.id, p.username]));

  return (
    <div>
      <h1 className="heading-display text-3xl">Feedback</h1>
      <p className="mt-2 text-muted-foreground">The 200 most recent messages, newest first.</p>

      {error && <p role="alert" className="mt-6 text-destructive">Could not load feedback: {error.message}</p>}
      {!error && rows.length === 0 && <p className="mt-6 text-muted-foreground">No feedback yet.</p>}

      <ul className="mt-6 space-y-4">
        {rows.map((f) => (
          <li
            key={f.id}
            className={`rounded-[var(--radius)] border border-border p-4 ${f.handled_at ? "bg-muted" : "bg-card"}`}
          >
            <p className="text-sm text-muted-foreground">
              <AdminTime value={f.created_at} />
              {f.page ? `, from ${f.page}` : ""}
              {f.handled_at ? ". Handled" : ". Not handled"}
            </p>
            <p className="mt-2 break-words whitespace-pre-wrap">{f.message}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {f.user_id ? `User: @${usernames.get(f.user_id) ?? f.user_id}` : "Not signed in"}
              {f.email ? `. Reply to: ${f.email}` : ""}
            </p>
            <div className="mt-3">
              <AdminActionButton
                action={adminSetFeedbackHandled.bind(null, f.id, !f.handled_at)}
                label={f.handled_at ? "Mark as not handled" : "Mark as handled"}
                successMessage={f.handled_at ? "Marked as not handled." : "Marked as handled."}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
