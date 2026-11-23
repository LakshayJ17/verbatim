import Link from "next/link";
import { requireAdmin } from "@/utils/auth/admin";
import { createAdminClient } from "@/utils/supabase/admin";
import { DailyBars, formatValue, type DailyPoint } from "@/components/admin/daily-bars";
import { AdminTime } from "@/components/admin/time";
import { getConfiguredModel } from "@/utils/ai/provider";
import { getModelPrice } from "@/utils/ai/pricing";

export const metadata = { title: "Usage and cost" };

const PERIODS = [7, 30, 90] as const;

interface Summary {
  days: number;
  users_total: number;
  new_users: number;
  active_users: number;
  active_users_7d: number;
  funnel: { signed_up: number; added_video: number; got_quotes: number; used_image: number; published: number };
  value: Record<string, number>;
  cost: {
    total_usd: number;
    today_usd: number;
    calls: number;
    cache_hits: number;
    failures: number;
    prompt_tokens: number;
    output_tokens: number;
    transcript_calls: number;
    by_mode: Record<string, { runs: number; cost_usd: number; avg_cost_usd: number; avg_ms: number | null }>;
    by_model: Record<string, { runs: number; cost_usd: number }>;
    errors: Record<string, number>;
  };
  safety: { flagged_runs: number; flags: Record<string, number> };
}

interface DailyRow {
  day: string;
  new_users: number;
  active_users: number;
  sources_added: number;
  analyses_completed: number;
  analyses_failed: number;
  cache_hits: number;
  cost_usd: number | string;
  downloads: number;
  posts_published: number;
}

interface TopUser {
  user_id: string;
  username: string | null;
  analyses: number;
  failures: number;
  cost_usd: number | string;
  images: number;
  posts: number;
  last_active: string | null;
}

const ERROR_LABELS: Record<string, string> = {
  TIMEOUT: "Took too long",
  SAFETY: "Blocked by AI safety filters",
  RECITATION: "AI refused to reproduce passages",
  TRUNCATED: "Answer cut off (output cap)",
  LOOPING: "Model repeated itself (stopped early)",
  INVALID_JSON: "Answer not valid JSON",
  SCHEMA: "Answer missing required fields",
  EMPTY: "Empty answer",
  RATE_LIMITED: "Gemini rate limit",
  MODEL_UNAVAILABLE: "Model retired or not available to this API key",
  NO_RESPONSE: "Gemini sent no response",
  OVERLOADED: "Gemini overloaded (503)",
  UPSTREAM: "Gemini error",
  CONFIG: "Server misconfigured",
  INTERNAL: "Database or app error",
};

const FLAG_LABELS: Record<string, string> = {
  ignore_instructions: 'Text like "Ignore previous instructions"',
  new_instructions: "Claims to give new instructions",
  role_override: "Tries to change the AI's role",
  system_prompt_probe: "Asks for the hidden prompt",
  chat_template_token: "Chat-template control tokens",
  fake_delimiter: "Tries to close the transcript block",
  output_steering: 'Tries to steer results (e.g. "mark all verified")',
  respond_only: '"Respond only with" instructions',
  invisible_chars: "Hidden (zero-width / bidi) characters",
};

function pct(part: number, whole: number): string {
  if (!whole) return "-";
  const p = (part / whole) * 100;
  return `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)}%`;
}

function num(n: number | string | null | undefined): number {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function envUsd(name: string): number | null {
  const n = Number(process.env[name] ?? "");
  return Number.isFinite(n) && n > 0 ? n : null;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold">{title}</h2>
      {note && <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const requested = Number(Array.isArray(sp.days) ? sp.days[0] : sp.days);
  const days = (PERIODS as readonly number[]).includes(requested) ? requested : 30;
  const admin = createAdminClient();

  const [summaryRes, dailyRes, topRes] = await Promise.all([
    admin.rpc("admin_usage_summary", { p_days: days }),
    admin.rpc("admin_usage_daily", { p_days: days }),
    admin.rpc("admin_top_users", { p_days: days, p_limit: 10 }),
  ]);

  const missing = [summaryRes.error, dailyRes.error, topRes.error].find(
    (e) => e && (e.code === "PGRST202" || e.code === "42883" || e.code === "42P01")
  );
  if (missing || summaryRes.error) {
    return (
      <div className="max-w-2xl">
        <h1 className="heading-display text-3xl">Usage and cost</h1>
        <div role="alert" className="mt-6 rounded-[var(--radius)] border border-border bg-card p-5">
          <p className="font-semibold">Usage tracking is not set up yet.</p>
          <p className="mt-2 text-base text-muted-foreground">
            {missing
              ? "Run supabase/migrations/20261121120000_usage_cost_and_hardening.sql in the Supabase SQL Editor, then reload this page."
              : `Could not load usage data: ${summaryRes.error?.message}`}
          </p>
        </div>
      </div>
    );
  }

  const s = summaryRes.data as Summary;
  const daily = (dailyRes.data ?? []) as DailyRow[];
  const top = (topRes.data ?? []) as TopUser[];
  const v = s.value;
  const c = s.cost;

  const series = (pick: (r: DailyRow) => number): DailyPoint[] => daily.map((r) => ({ day: String(r.day).slice(0, 10), value: pick(r) }));

  const totalUsd = num(c.total_usd);
  const todayUsd = num(c.today_usd);
  const completed = num(v.analyses_completed);
  const checkedQuotes = num(v.quotes_generated) - num(v.quotes_unchecked);
  const imagesUsed = num(v.images_downloaded) + num(v.images_shared);
  const runs = num(c.calls) + num(c.cache_hits);
  const budget = envUsd("AI_DAILY_BUDGET_USD");
  const userBudget = envUsd("AI_USER_DAILY_BUDGET_USD");

  const transcript = c.by_mode?.transcript;
  const video = c.by_mode?.video;
  const avgSuccessCost = completed - num(c.cache_hits) > 0 ? totalUsd / (completed - num(c.cache_hits)) : 0;
  const cacheSavings = num(c.cache_hits) * avgSuccessCost;
  const transcriptSavings =
    transcript && video && num(video.avg_cost_usd) > num(transcript.avg_cost_usd)
      ? num(transcript.runs) * (num(video.avg_cost_usd) - num(transcript.avg_cost_usd))
      : null;

  const model = getConfiguredModel();
  const price = getModelPrice(model);
  const isAlias = /-latest$/.test(model);

  const funnelSteps: Array<[string, number]> = [
    ["Signed up", s.funnel.signed_up],
    ["Added a video", s.funnel.added_video],
    ["Got quotes", s.funnel.got_quotes],
    ["Saved, downloaded or shared an image", s.funnel.used_image],
    ["Published to Commonplace", s.funnel.published],
  ];
  const funnelMax = Math.max(1, ...funnelSteps.map(([, n]) => n));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="heading-display text-3xl">Usage and cost</h1>
          <p className="mt-1 text-base text-muted-foreground">
            What people get out of Verbatim and what it costs to run. Last {days} days, UTC.
          </p>
        </div>
        <nav aria-label="Period" className="flex gap-1">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={`/admin/usage?days=${p}`}
              aria-current={p === days ? "page" : undefined}
              className={`inline-flex h-10 items-center rounded-[var(--radius)] px-3 text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                p === days ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {p} days
            </Link>
          ))}
        </nav>
      </div>

      <Section title="Value delivered">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Active users" value={formatValue(s.active_users, "int")} sub={`${s.active_users_7d} in the last 7 days`} />
          <Tile label="New users" value={formatValue(s.new_users, "int")} sub={`${s.users_total} accounts in total`} />
          <Tile label="Analyses completed" value={formatValue(completed, "int")} sub={`${num(v.sources_added)} videos added`} />
          <Tile label="Quotes found" value={formatValue(num(v.quotes_generated), "int")} sub={`${num(v.insights_generated)} insights`} />
          <Tile
            label="Quotes verified word for word"
            value={pct(num(v.quotes_verified), checkedQuotes)}
            sub={`${num(v.quotes_verified)} of ${checkedQuotes} checked against a transcript`}
          />
          <Tile label="Images downloaded or shared" value={formatValue(imagesUsed, "int")} sub={`${num(v.designs_saved)} designs saved`} />
          <Tile label="Posts published" value={formatValue(num(v.posts_published), "int")} sub={`${num(v.likes)} likes, ${num(v.comments)} comments`} />
          <Tile
            label="Images per analysis"
            value={completed ? (imagesUsed / completed).toFixed(1) : "-"}
            sub="How much each analysis gets used"
          />
        </div>
      </Section>

      <Section title="Activation funnel" note="Distinct users who reached each step during the period.">
        <ol className="space-y-2 rounded-[var(--radius)] border border-border bg-card p-4 viz-root">
          {funnelSteps.map(([label, n], i) => (
            <li key={label} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3 text-base">
              <span className="truncate">{label}</span>
              <span className="h-3 rounded-[4px] bg-muted" aria-hidden="true">
                <span
                  className="block h-3 rounded-[4px]"
                  style={{ width: `${(n / funnelMax) * 100}%`, background: "var(--viz-bar)" }}
                  title={`${label}: ${n}`}
                />
              </span>
              <span className="w-24 text-right tabular-nums">
                {n}
                {i > 0 && <span className="ml-1 text-sm text-muted-foreground">({pct(n, funnelSteps[i - 1][1])})</span>}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Daily activity">
        <div className="grid gap-4 lg:grid-cols-2">
          <DailyBars title="Analyses completed" data={series((r) => r.analyses_completed)} />
          <DailyBars title="Active users" data={series((r) => r.active_users)} />
          <DailyBars title="Images downloaded or shared" data={series((r) => r.downloads)} />
          <DailyBars title="Videos added" data={series((r) => r.sources_added)} />
        </div>
      </Section>

      <Section
        title="AI cost"
        note="Estimated from token counts and list prices (utils/ai/pricing.ts). Check against your Google billing; override prices with AI_PRICE_* variables."
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label={`Spend, last ${days} days`} value={formatValue(totalUsd, "usd")} sub={`${num(c.calls)} model calls`} />
          <Tile
            label="Spend today"
            value={formatValue(todayUsd, "usd")}
            sub={budget ? `${pct(todayUsd, budget)} of the $${budget} daily budget` : "No daily budget set (AI_DAILY_BUDGET_USD)"}
          />
          <Tile label="Average cost per analysis" value={avgSuccessCost ? formatValue(avgSuccessCost, "usd") : "-"} sub="All-in: failed attempts included, cache hits excluded" />
          <Tile label="Cost per active user" value={s.active_users ? formatValue(totalUsd / s.active_users, "usd") : "-"} />
          <Tile
            label="Served from cache"
            value={pct(num(c.cache_hits), runs)}
            sub={cacheSavings ? `≈ ${formatValue(cacheSavings, "usd")} saved` : "Same video analysed again = free"}
          />
          <Tile
            label="Transcript-first analyses"
            value={pct(num(transcript?.runs), num(transcript?.runs) + num(video?.runs))}
            sub={transcriptSavings ? `≈ ${formatValue(transcriptSavings, "usd")} saved vs. video` : "Text is far cheaper than video"}
          />
          <Tile label="Failed runs" value={pct(num(c.failures), num(c.calls))} sub={`${num(c.failures)} of ${num(c.calls)} calls`} />
          <Tile
            label="Tokens"
            value={`${(num(c.prompt_tokens) / 1e6).toFixed(2)}M in`}
            sub={`${(num(c.output_tokens) / 1e6).toFixed(2)}M out (incl. thinking)`}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <DailyBars title="AI spend (USD)" data={series((r) => num(r.cost_usd))} format="usd" />
          <div className="rounded-[var(--radius)] border border-border bg-card p-4">
            <h3 className="text-base font-semibold">By analysis path</h3>
            <table className="mt-3 w-full text-left text-base">
              <thead className="text-sm text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Path</th>
                  <th className="pb-2 text-right font-medium">Runs</th>
                  <th className="pb-2 text-right font-medium">Avg cost</th>
                  <th className="pb-2 text-right font-medium">Avg time</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {(["transcript", "video"] as const).map((mode) => {
                  const m = c.by_mode?.[mode];
                  return (
                    <tr key={mode} className="border-t border-border">
                      <td className="py-2">{mode === "transcript" ? "Transcript (text)" : "Video (fallback)"}</td>
                      <td className="py-2 text-right">{num(m?.runs)}</td>
                      <td className="py-2 text-right">{m ? formatValue(num(m.avg_cost_usd), "usd") : "-"}</td>
                      <td className="py-2 text-right">{m?.avg_ms ? `${Math.round(num(m.avg_ms) / 1000)} s` : "-"}</td>
                      <td className="py-2 text-right">{m ? formatValue(num(m.cost_usd), "usd") : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <h3 className="mt-6 text-base font-semibold">Current configuration</h3>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Model</dt>
              <dd>
                <code>{model}</code>
                {isAlias && (
                  <span className="ml-2 text-foreground">
                    Alias: Google can repoint it to a pricier model. Pin an exact model in AI_MODEL.
                  </span>
                )}
              </dd>
              <dt className="text-muted-foreground">Price used</dt>
              <dd className="tabular-nums">
                ${price.input} in / ${price.audio} audio / ${price.output} out per 1M tokens
              </dd>
              <dt className="text-muted-foreground">Analysis mode</dt>
              <dd>{process.env.AI_ANALYSIS_MODE || "auto"} (transcript first, video when there is none)</dd>
              <dt className="text-muted-foreground">Thinking</dt>
              <dd>{process.env.AI_THINKING_LEVEL || process.env.AI_THINKING_BUDGET || "1024 token budget (default)"}</dd>
              <dt className="text-muted-foreground">Budgets</dt>
              <dd>
                {budget ? `$${budget}/day total` : "no total cap"}, {userBudget ? `$${userBudget}/day per user` : "no per-user cap"}
              </dd>
              <dt className="text-muted-foreground">Result cache</dt>
              <dd>{Number(process.env.AI_CACHE_TTL_DAYS ?? 30) > 0 ? `${process.env.AI_CACHE_TTL_DAYS ?? 30} days` : "off"}</dd>
            </dl>
          </div>
        </div>
      </Section>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Section title="Why runs failed">
          {Object.keys(c.errors ?? {}).length === 0 ? (
            <p className="rounded-[var(--radius)] border border-border bg-card p-4 text-muted-foreground">No failed runs.</p>
          ) : (
            <ul className="divide-y divide-border rounded-[var(--radius)] border border-border bg-card">
              {Object.entries(c.errors)
                .sort((a, b) => b[1] - a[1])
                .map(([code, n]) => (
                  <li key={code} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <span>
                      {ERROR_LABELS[code] ?? code} <code className="ml-1 text-sm text-muted-foreground">{code}</code>
                    </span>
                    <span className="font-medium tabular-nums">{n}</span>
                  </li>
                ))}
            </ul>
          )}
        </Section>

        <Section
          title="Prompt-injection signals"
          note="Videos whose captions or title contained text that tries to instruct the AI. These are flagged, not blocked: the model is told to ignore such text and quotes are always re-checked against the transcript."
        >
          {s.safety.flagged_runs === 0 ? (
            <p className="rounded-[var(--radius)] border border-border bg-card p-4 text-muted-foreground">No flagged videos.</p>
          ) : (
            <ul className="divide-y divide-border rounded-[var(--radius)] border border-border bg-card">
              <li className="flex items-center justify-between gap-4 px-4 py-2.5 font-medium">
                <span>Flagged runs</span>
                <span className="tabular-nums">{s.safety.flagged_runs}</span>
              </li>
              {Object.entries(s.safety.flags)
                .sort((a, b) => b[1] - a[1])
                .map(([flag, n]) => (
                  <li key={flag} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <span>{FLAG_LABELS[flag] ?? flag}</span>
                    <span className="tabular-nums">{n}</span>
                  </li>
                ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Heaviest users" note="By AI spend. Use this to spot both power users and abuse.">
        {top.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-border bg-card p-4 text-muted-foreground">No AI usage in this period.</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-card">
            <table className="w-full min-w-[40rem] text-left text-base">
              <thead className="text-sm text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 text-right font-medium">Analyses</th>
                  <th className="px-4 py-2 text-right font-medium">Failed</th>
                  <th className="px-4 py-2 text-right font-medium">AI spend</th>
                  <th className="px-4 py-2 text-right font-medium">Images</th>
                  <th className="px-4 py-2 text-right font-medium">Posts</th>
                  <th className="px-4 py-2 font-medium">Last active</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {top.map((u) => (
                  <tr key={u.user_id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <Link href={`/admin/users?q=${u.user_id}`} className="underline underline-offset-4">
                        {u.username ?? u.user_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right">{u.analyses}</td>
                    <td className="px-4 py-2 text-right">{u.failures}</td>
                    <td className="px-4 py-2 text-right">{formatValue(num(u.cost_usd), "usd")}</td>
                    <td className="px-4 py-2 text-right">{u.images}</td>
                    <td className="px-4 py-2 text-right">{u.posts}</td>
                    <td className="px-4 py-2 text-sm">
                      <AdminTime value={u.last_active} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
