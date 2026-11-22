import Link from "next/link";
import { Palette } from "@phosphor-icons/react/dist/ssr";

interface InsightCardProps {
  id?: string;
  title: string;
  summary: string;
  /** Video title. Leave out where the page is already about one video. */
  source?: string;
  category: string;
  relevance?: "high" | "medium";
}

export function InsightCard({ id, title, summary, source, category, relevance = "medium" }: InsightCardProps) {
  return (
    <article className="flex flex-col rounded-[var(--radius)] bg-muted p-5 sm:p-6">
      <p className="flex flex-wrap gap-2 text-sm">
        <span className="inline-flex h-7 items-center rounded-sm bg-card px-2 font-medium text-ink">{category}</span>
        {relevance === "high" && (
          <span className="inline-flex h-7 items-center rounded-sm bg-ink px-2 font-medium text-paper">Key insight</span>
        )}
      </p>
      <h3 className="heading-display mt-4 text-2xl text-foreground">{title}</h3>
      <p className="mt-3 text-base leading-relaxed text-foreground">{summary}</p>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">
        {source ? <p className="text-sm text-muted-foreground">{source}</p> : <span />}
        {id && (
          <Link
            href={`/create/insight/${id}`}
            className="press inline-flex h-10 items-center gap-2 rounded-md border border-input/50 bg-card px-3 text-sm font-medium text-foreground outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Palette className="size-4" aria-hidden="true" />
            Make a quote card
          </Link>
        )}
      </div>
    </article>
  );
}
