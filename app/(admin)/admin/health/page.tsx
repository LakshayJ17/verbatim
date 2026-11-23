import Link from "next/link";
import { requireAdmin } from "@/utils/auth/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { adminFailStuckAnalyses } from "@/app/actions/admin";
import { AdminActionButton } from "@/components/admin/action-button";
import { AdminTime } from "@/components/admin/time";
import { getConfiguredModel } from "@/utils/ai/provider";

export const metadata = { title: "System health" };

type Check = { label: string; ok: boolean | null; detail?: string };

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AI_API_KEY",
  "SUPADATA_API_KEY",
  "YOUTUBE_DATA_API_KEY",
  "NEXT_PUBLIC_SITE_URL",
];

const TABLES = ["usage_events", "ai_usage", "analysis_cache", "transcript_cache", "rate_limit_events", "reports", "admin_audit_log"];

const FUNCTIONS: Array<[string, Record<string, unknown>]> = [
  ["claim_analysis", { p_source_id: "00000000-0000-0000-0000-000000000000" }],
  ["public_post_sources", { p_post_ids: [] }],
  ["ai_spend_since", { p_since: new Date(0).toISOString() }],
  ["admin_usage_summary", { p_days: 1 }],
  ["consume_rate_limit", { p_action: "like", p_limit: 1, p_window_seconds: 1 }],
  ["owns_design", { p_design_id: "00000000-0000-0000-0000-000000000000" }],
];

/** ISO cutoffs for "last 24h" and "stuck for 10+ minutes", computed per request. */
function cutoffs() {
  const now = Date.now();
  return {
    since24h: new Date(now - 24 * 3600_000).toISOString(),
    staleCutoff: new Date(now - 10 * 60_000).toISOString(),
  };
}

function Status({ ok }: { ok: boolean | null }) {
  const label = ok === true ? "OK" : ok === false ? "Problem" : "Check";
  const cls = ok === true ? "bg-tag-green text-tag-green-fg" : ok === false ? "bg-destructive/10 text-destructive" : "bg-tag-gray text-tag-gray-fg";
  return <span className={`inline-flex w-20 justify-center rounded-sm px-2 py-0.5 text-sm font-medium ${cls}`}>{label}</span>;
}

function CheckList({ title, checks }: { title: string; checks: Check[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      <ul className="mt-3 divide-y divide-border rounded-[var(--radius)] border border-border bg-card">
        {checks.map((c) => (
          <li key={c.label} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
            <Status ok={c.ok} />
            <span className="font-medium">{c.label}</span>
            {c.detail && <span className="text-sm text-muted-foreground">{c.detail}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Configuration, database and pipeline health in one place. Shows which
 * environment variables are set (never their values), whether the latest
 * migration is applied, stuck runs and recent failures.
 */
export default async function AdminHealthPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { since24h, staleCutoff } = cutoffs();

  const model = getConfiguredModel();
  const envChecks: Check[] = [
    ...REQUIRED_ENV.map((k) => ({ label: k, ok: Boolean(process.env[k]), detail: process.env[k] ? "set" : "missing" })),
    {
      label: "AI_MODEL",
      ok: /-latest$/.test(model) ? null : true,
      detail: /-latest$/.test(model) ? `${model}: an alias Google can repoint to another model or price. Pin an exact model.` : model,
    },
    { label: "AI_FALLBACK_MODELS", ok: process.env.AI_FALLBACK_MODELS ? true : null, detail: process.env.AI_FALLBACK_MODELS || "none: no backup if the model is unavailable" },
    { label: "AI_DAILY_BUDGET_USD", ok: process.env.AI_DAILY_BUDGET_USD ? true : null, detail: process.env.AI_DAILY_BUDGET_USD ? `$${process.env.AI_DAILY_BUDGET_USD}/day` : "no spend cap" },
    { label: "VERBATIM_DEBUG", ok: null, detail: process.env.VERBATIM_DEBUG === "1" ? "on: pipeline steps are logged" : "off" },
  ];

  const tableResults = await Promise.all(TABLES.map((t) => admin.from(t).select("*", { count: "exact", head: true })));
  const fnResults = await Promise.all(FUNCTIONS.map(([fn, params]) => admin.rpc(fn, params)));
  const dbChecks: Check[] = [
    ...TABLES.map((t, i) => {
      const r = tableResults[i];
      // A missing table can come back as no error and a null count on HEAD requests.
      const missing = Boolean(r.error) || r.count === null;
      return { label: `table ${t}`, ok: !missing, detail: missing ? "missing, apply the latest migration" : `${r.count} rows` };
    }),
    ...FUNCTIONS.map(([fn], i) => {
      const e = fnResults[i].error;
      // 42501 "Not signed in" means the function exists (the service role has no user).
      const missing = e && (e.code === "PGRST202" || e.code === "42883");
      return { label: `function ${fn}()`, ok: !missing, detail: missing ? "missing, apply the latest migration" : "present" };
    }),
  ];

  const [stuckRes, failedRes, txRes, profilesRes] = await Promise.all([
    admin.from("analyses").select("id, source_id, updated_at").eq("status", "processing").lt("updated_at", staleCutoff).limit(50),
    admin.from("ai_usage").select("id, created_at, user_id, source_id, mode, model, error_code, duration_ms").eq("status", "error").gte("created_at", since24h).order("created_at", { ascending: false }).limit(25),
    admin.from("usage_events").select("id, created_at, properties").eq("event", "transcript_unavailable").gte("created_at", since24h).order("created_at", { ascending: false }).limit(15),
    admin.from("profiles").select("id", { count: "exact", head: true }),
  ]);
  const stuck = stuckRes.data ?? [];
  const failed = failedRes.data ?? [];
  const transcriptFailures = txRes.data ?? [];

  const { data: authPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authCount = authPage?.users?.length ?? 0;
  const pipelineChecks: Check[] = [
    { label: "Analyses stuck on processing", ok: stuck.length === 0, detail: `${stuck.length} older than 10 minutes` },
    { label: "AI failures in the last 24h", ok: failed.length === 0 ? true : null, detail: `${failed.length}` },
    { label: "Transcript failures in the last 24h", ok: transcriptFailures.length === 0 ? true : null, detail: `${transcriptFailures.length} (those videos fall back to the pricier video path)` },
    {
      label: "Every account has a profile",
      ok: authCount < 1000 ? authCount === (profilesRes.count ?? 0) : null,
      detail: `${authCount}${authCount >= 1000 ? "+" : ""} accounts, ${profilesRes.count ?? 0} profiles`,
    },
  ];

  return (
    <div>
      <h1 className="heading-display text-3xl">System health</h1>
      <p className="mt-1 max-w-[70ch] text-base text-muted-foreground">
        Configuration, database and pipeline status. Secret values are never shown.
      </p>

      <CheckList title="Pipeline" checks={pipelineChecks} />

      {stuck.length > 0 && (
        <section className="mt-4 rounded-[var(--radius)] border border-border bg-card p-4">
          <p className="text-base">
            {stuck.length} {stuck.length === 1 ? "analysis is" : "analyses are"} stuck. Marking them failed lets their owners retry.
          </p>
          <div className="mt-3">
            <AdminActionButton
              action={adminFailStuckAnalyses}
              label="Mark stuck analyses failed"
              confirmLabel="Confirm: mark failed"
              successMessage="Stuck analyses marked failed."
            />
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Recent AI failures (24h)</h2>
        {failed.length === 0 ? (
          <p className="mt-3 rounded-[var(--radius)] border border-border bg-card p-4 text-muted-foreground">None.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-[var(--radius)] border border-border bg-card">
            <table className="w-full min-w-[40rem] text-left text-base">
              <thead className="text-sm text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Code</th>
                  <th className="px-4 py-2 font-medium">Path</th>
                  <th className="px-4 py-2 font-medium">Model</th>
                  <th className="px-4 py-2 text-right font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">User</th>
                </tr>
              </thead>
              <tbody>
                {failed.map((f) => (
                  <tr key={f.id} className="border-t border-border">
                    <td className="px-4 py-2 text-sm"><AdminTime value={f.created_at} /></td>
                    <td className="px-4 py-2"><code>{f.error_code ?? "UNKNOWN"}</code></td>
                    <td className="px-4 py-2">{f.mode}</td>
                    <td className="px-4 py-2 text-sm">{f.model}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{f.duration_ms ? `${Math.round(f.duration_ms / 1000)} s` : "-"}</td>
                    <td className="px-4 py-2">
                      {f.user_id ? (
                        <Link href={`/admin/users?q=${f.user_id}`} className="underline underline-offset-4">
                          {String(f.user_id).slice(0, 8)}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          MODEL_UNAVAILABLE or NO_RESPONSE: check AI_MODEL and AI_FALLBACK_MODELS. OVERLOADED or RATE_LIMITED: Gemini-side, usually
          temporary. TIMEOUT on the video path: the video took longer than the 300 s limit.
        </p>
      </section>

      {transcriptFailures.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Recent transcript failures (24h)</h2>
          <ul className="mt-3 divide-y divide-border rounded-[var(--radius)] border border-border bg-card">
            {transcriptFailures.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-4 px-4 py-2.5 text-base">
                <span className="text-sm"><AdminTime value={t.created_at} /></span>
                <code>{String((t.properties as { code?: string })?.code ?? "UNKNOWN")}</code>
                <span className="text-sm text-muted-foreground">source {String((t.properties as { source_id?: string })?.source_id ?? "").slice(0, 8)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CheckList title="Configuration" checks={envChecks} />
      <CheckList title="Database" checks={dbChecks} />
    </div>
  );
}
