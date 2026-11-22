import { requireAdmin } from "@/utils/auth/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { AdminTime } from "@/components/admin/time";

export const metadata = { title: "Audit log" };

interface AuditRow {
  id: string;
  admin_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export default async function AdminAuditPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("admin_audit_log")
    .select("id, admin_id, action, target_type, target_id, details, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as AuditRow[];

  const adminIds = [...new Set(rows.map((r) => r.admin_id))];
  const { data: profiles } = adminIds.length
    ? await admin.from("profiles").select("id, username").in("id", adminIds)
    : { data: [] };
  const usernames = new Map(((profiles ?? []) as Array<{ id: string; username: string }>).map((p) => [p.id, p.username]));

  return (
    <div>
      <h1 className="heading-display text-3xl">Audit log</h1>
      <p className="mt-2 text-muted-foreground">The latest 200 admin actions.</p>

      {error && <p role="alert" className="mt-6 text-destructive">Could not load the audit log: {error.message}</p>}
      {!error && rows.length === 0 && <p className="mt-6 text-muted-foreground">No admin actions yet.</p>}

      {rows.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-[var(--radius)] border border-border bg-card">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Admin actions, newest first</caption>
            <thead className="bg-muted text-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Time</th>
                <th scope="col" className="px-3 py-2 font-medium">Admin</th>
                <th scope="col" className="px-3 py-2 font-medium">Action</th>
                <th scope="col" className="px-3 py-2 font-medium">Target</th>
                <th scope="col" className="px-3 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap"><AdminTime value={r.created_at} /></td>
                  <td className="px-3 py-2">@{usernames.get(r.admin_id) ?? r.admin_id}</td>
                  <td className="px-3 py-2 font-mono">{r.action}</td>
                  <td className="px-3 py-2 break-all">
                    {r.target_type}
                    {r.target_id ? ` ${r.target_id}` : ""}
                  </td>
                  <td className="max-w-xs px-3 py-2 break-all font-mono text-muted-foreground">
                    {r.details && Object.keys(r.details).length ? JSON.stringify(r.details) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
