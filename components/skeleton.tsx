import { cn } from "@/lib/utils";

/** A placeholder block shaped like the content it stands in for. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-surface motion-reduce:animate-none", className)} />;
}

/** Page header plus a list of row placeholders, used by route loading states. */
export function PageSkeleton({ rows = 5, grid = false }: { rows?: number; grid?: boolean }) {
  return (
    <div role="status" aria-live="polite" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-10 w-56" />
      <Skeleton className="mt-3 h-5 w-80 max-w-full" />
      {grid ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <Skeleton className="aspect-square w-full" />
              <Skeleton className="mt-4 h-5 w-2/3" />
              <Skeleton className="mt-2 h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-10 space-y-2">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="mt-3 h-4 w-1/3" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
