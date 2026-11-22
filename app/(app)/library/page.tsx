import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import { pickAnalysis } from "@/utils/analysis/pick";

export const metadata: Metadata = {
  title: "Library",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "Analyzed",
  processing: "Analyzing",
  failed: "Analysis failed",
  pending: "Not analyzed",
};

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: sources } = user
    ? await supabase
        .from("sources")
        .select("id, title, creator_name, duration_seconds, source_type, created_at, analyses(status, updated_at, created_at)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="heading-display text-3xl sm:text-4xl">Library</h1>
          <p className="mt-2 text-base text-muted-foreground">Every video and transcript you have added.</p>
        </div>
        <Link href="/dashboard/new">
          <Button size="lg">Make quote images</Button>
        </Link>
      </div>

      {!sources || sources.length === 0 ? (
        <div className="bg-muted p-8 sm:p-10">
          <h2 className="text-2xl font-semibold">Nothing here yet</h2>
          <p className="mt-2 max-w-[48ch] text-base">
            Paste a YouTube link to a podcast, interview or lecture and its quotes and insights will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sources.map((source) => {
            const status = pickAnalysis(source.analyses)?.status ?? "pending";
            return (
              <li key={source.id}>
                <Link
                  href={`/library/${source.id}`}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold leading-snug text-foreground">{source.title}</h2>
                    <p className="mt-1 text-base text-muted-foreground">
                      {[
                        source.creator_name,
                        source.duration_seconds ? `${Math.round(source.duration_seconds / 60)} min` : null,
                        new Date(source.created_at).toLocaleDateString(),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 self-start rounded-sm px-2.5 py-1 text-sm font-medium sm:self-center ${
                      status === "completed" ? "bg-tag-green text-tag-green-fg" : "bg-tag-gray text-tag-gray-fg"
                    }`}
                  >
                    {STATUS_LABEL[status] ?? status}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
