import { requireAdmin } from "@/utils/auth/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import Link from "next/link";
import { daysAgoIso } from "@/utils/moderation/admin-schemas";
import { formatValue } from "@/components/admin/daily-bars";

export const metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const since = daysAgoIso(7);

  const [reports, posts, users, feedback, summary] = await Promise.all([
    admin.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    admin.from("posts").select("id", { count: "exact", head: true }).eq("visibility", "public").gte("created_at", since),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since),
    admin.from("feedback").select("id", { count: "exact", head: true }).gte("created_at", since),
    admin.rpc("admin_usage_summary", { p_days: 7 }),
  ]);
  const usage = summary.error ? null : (summary.data as { active_users: number; value: { analyses_completed: number }; cost: { today_usd: number; total_usd: number } });

  const show = (r: { count: number | null; error: unknown }) => (r.error ? "Unavailable" : String(r.count ?? 0));

  return (
    <div className="max-w-2xl">
      <h1 className="heading-display text-3xl">Overview</h1>
      <ul className="mt-6 divide-y divide-border rounded-[var(--radius)] border border-border bg-card">
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin/reports" className="underline underline-offset-4">Open reports</Link>
          <span className="font-medium tabular-nums">{show(reports)}</span>
        </li>
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin/posts" className="underline underline-offset-4">Public posts in the last 7 days</Link>
          <span className="font-medium tabular-nums">{show(posts)}</span>
        </li>
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin/users" className="underline underline-offset-4">New users in the last 7 days</Link>
          <span className="font-medium tabular-nums">{show(users)}</span>
        </li>
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin/feedback" className="underline underline-offset-4">Feedback in the last 7 days</Link>
          <span className="font-medium tabular-nums">{show(feedback)}</span>
        </li>
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin/usage" className="underline underline-offset-4">Active users in the last 7 days</Link>
          <span className="font-medium tabular-nums">{usage ? usage.active_users : "Unavailable"}</span>
        </li>
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin/usage" className="underline underline-offset-4">Analyses completed in the last 7 days</Link>
          <span className="font-medium tabular-nums">{usage ? usage.value.analyses_completed : "Unavailable"}</span>
        </li>
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin/usage" className="underline underline-offset-4">AI spend today / last 7 days</Link>
          <span className="font-medium tabular-nums">
            {usage ? `${formatValue(Number(usage.cost.today_usd), "usd")} / ${formatValue(Number(usage.cost.total_usd), "usd")}` : "Unavailable"}
          </span>
        </li>
      </ul>
    </div>
  );
}
