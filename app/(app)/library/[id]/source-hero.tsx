import type { ReactNode } from "react";
import Image from "next/image";
import { ArrowSquareOut, Check, Play } from "@phosphor-icons/react/dist/ssr";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SourceStats {
  quotes: number;
  verified: number;
  ideas: number;
}

/** YouTube video ids are 11 characters of [A-Za-z0-9_-]; anything else gets no thumbnail. */
function thumbnailUrl(videoId: string | null | undefined): string | null {
  return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

/**
 * The top of a video's page: a solid teal band with the title, what the
 * analysis found and the video's own thumbnail, which links to YouTube.
 */
export function SourceHero({
  title,
  creatorName,
  durationSeconds,
  createdAt,
  videoUrl,
  videoId,
  stats,
}: {
  title: string;
  creatorName?: string | null;
  durationSeconds?: number | null;
  createdAt: string;
  videoUrl?: string | null;
  videoId?: string | null;
  /** Counts from a finished analysis; left out while it runs or if it failed. */
  stats?: SourceStats | null;
}) {
  const thumb = thumbnailUrl(videoId);
  const added = new Date(createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <section
      aria-labelledby="source-title"
      className="grid gap-8 rounded-[var(--radius)] bg-ink p-6 text-paper sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center lg:gap-12 lg:p-10"
    >
      <div className="min-w-0">
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-paper/75">
          <span>YouTube video</span>
          {durationSeconds ? <span className="tabular-nums">{Math.max(1, Math.round(durationSeconds / 60))} min</span> : null}
          <span>Added {added}</span>
        </p>
        <h1 id="source-title" className="heading-display mt-3 max-w-[26ch] text-3xl text-paper sm:text-4xl lg:text-5xl">
          {title}
        </h1>
        {creatorName && <p className="mt-4 text-lg font-medium text-paper">{creatorName}</p>}

        {stats && (
          <dl className="mt-8 grid grid-cols-3 gap-4 sm:flex sm:gap-x-10">
            <Stat value={stats.quotes} label={stats.quotes === 1 ? "quote found" : "quotes found"} />
            <Stat
              value={stats.verified}
              label={
                <>
                  <Check className="mr-1.5 inline size-3.5 align-[-0.125em]" weight="bold" aria-hidden="true" />
                  verified<span className="hidden sm:inline"> word for word</span>
                </>
              }
            />
            <Stat value={stats.ideas} label={stats.ideas === 1 ? "idea" : "ideas"} />
          </dl>
        )}

        {!thumb && videoUrl && (
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants(), "mt-8 h-11 bg-mark text-ink hover:bg-paper")}
          >
            <ArrowSquareOut className="size-4" aria-hidden="true" />
            Watch on YouTube
          </a>
        )}
      </div>

      {thumb && videoUrl && (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block aspect-video overflow-hidden rounded-[var(--radius)] bg-ink-hover outline-none focus-visible:ring-2 focus-visible:ring-paper focus-visible:ring-offset-4 focus-visible:ring-offset-ink"
        >
          {/* hqdefault is 4:3 with black bars; object-cover crops them off in a 16:9 frame. */}
          <Image
            src={thumb}
            alt=""
            fill
            sizes="(min-width: 1024px) 26rem, (min-width: 640px) 90vw, 100vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            priority
          />
          <span className="absolute bottom-3 left-3 inline-flex h-11 items-center gap-2 rounded-[var(--radius)] bg-mark px-4 text-base font-semibold text-ink transition-colors group-hover:bg-paper">
            <Play className="size-4" weight="fill" aria-hidden="true" />
            Watch on YouTube
            <span className="sr-only">(opens in a new tab)</span>
          </span>
        </a>
      )}
    </section>
  );
}

function Stat({ value, label }: { value: number; label: ReactNode }) {
  return (
    <div className="flex flex-col-reverse justify-end">
      <dt className="mt-2 text-sm text-paper/75">{label}</dt>
      <dd className="heading-display text-5xl leading-none tabular-nums text-paper">{value}</dd>
    </div>
  );
}
