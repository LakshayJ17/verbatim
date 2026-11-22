/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { fetchDashboardData } from "@/app/actions/dashboard";
import { pickAnalysis } from "@/utils/analysis/pick";

export const metadata: Metadata = {
  title: "Dashboard",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "Analyzed",
  processing: "Analyzing",
  failed: "Analysis failed",
  pending: "Not analyzed",
};

function SectionHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {href && (
        <Link href={href} className="text-base text-foreground underline underline-offset-4">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-border bg-card p-5 text-base text-muted-foreground">{children}</p>;
}

const rowClass =
  "block rounded-xl border border-border bg-card p-4 outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring";

export default async function DashboardPage() {
  const data = await fetchDashboardData();

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="heading-display text-3xl sm:text-4xl">You are browsing as a guest</h1>
        <p className="mt-3 max-w-[52ch] text-lg">
          Guests can browse what others post to Commonplace. Create an account to analyze your own videos and save
          quotes.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup">
            <Button size="lg">Create account</Button>
          </Link>
          <Link href="/discover">
            <Button size="lg" variant="outline">
              Go to Commonplace
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-12 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="heading-display text-3xl sm:text-4xl">Dashboard</h1>
          <p className="mt-2 text-base text-muted-foreground">Your latest videos, quote cards and collections.</p>
        </div>
        <Link href="/dashboard/new">
          <Button size="lg">Make quote images</Button>
        </Link>
      </div>

      <div className="grid gap-x-10 gap-y-14 md:grid-cols-2">
        <section>
          <SectionHeader title="Recent videos" href="/library" linkLabel="Library" />
          {data.recentSources.length === 0 ? (
            <Empty>No videos yet. Analyze one to see its quotes here.</Empty>
          ) : (
            <ul className="space-y-2">
              {data.recentSources.map((source: any) => {
                const status = pickAnalysis(source.analyses)?.status || "pending";
                return (
                  <li key={source.id}>
                    <Link href={`/library/${source.id}`} className={rowClass}>
                      <h3 className="line-clamp-1 text-lg font-semibold">{source.title}</h3>
                      <div className="mt-1 flex items-center justify-between gap-3 text-base">
                        <span className="truncate text-muted-foreground">{source.creator_name}</span>
                        <span
                          className={`shrink-0 rounded-sm px-2 py-0.5 text-sm font-medium ${
                            status === "completed" ? "bg-tag-green text-tag-green-fg" : "bg-tag-gray text-tag-gray-fg"
                          }`}
                        >
                          {STATUS_LABEL[status] ?? status}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader title="Saved quote cards" />
          {data.recentDesigns.length === 0 ? (
            <Empty>No quote cards yet. Open a verified quote and choose Make a quote card.</Empty>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {data.recentDesigns.map((design: any) => {
                const text = design.quote?.text || design.insight?.summary;
                return (
                  <li key={design.id} className="relative aspect-square overflow-hidden rounded-xl border border-border bg-card">
                    {design.rendered_image_url ? (
                      <Image src={design.rendered_image_url} alt={text ? `Quote card: ${text}` : "Quote card"} fill className="object-cover" />
                    ) : (
                      <p className="absolute inset-0 line-clamp-5 p-3 text-sm">{text}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader title="Collections" href="/collections" linkLabel="All collections" />
          {data.collections.length === 0 ? (
            <Empty>No collections yet.</Empty>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {data.collections.map((c: any) => (
                <li key={c.id}>
                  <Link href={`/collections/${c.id}`} className={`${rowClass} truncate text-lg font-medium`}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader title="Your posts" href="/discover" linkLabel="Discover" />
          {data.recentPosts.length === 0 ? (
            <Empty>Nothing published yet. Saved quote images can be posted to Commonplace.</Empty>
          ) : (
            <ul className="space-y-2">
              {data.recentPosts.map((post: any) => (
                <li key={post.id}>
                  <Link href={`/discover/${post.id}`} className={`${rowClass} flex items-center justify-between gap-3`}>
                    <span className="text-base">Posted {new Date(post.created_at).toLocaleDateString()}</span>
                    <span className="rounded-sm bg-tag-gray px-2 py-0.5 text-sm capitalize text-tag-gray-fg">{post.visibility}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
