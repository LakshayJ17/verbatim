/**
 * PostgREST returns an embedded relation as an array, or as a single object
 * when it detects a one-to-one relationship. Older code did `analyses?.[0]`,
 * which picked an arbitrary row when a race had created two analyses (and
 * would break outright on an object). These helpers handle both shapes.
 */

export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

const STATUS_RANK: Record<string, number> = { completed: 3, processing: 2, failed: 1, pending: 0 };

/** The analysis to show: completed first, then in progress, then the most recent. */
export function pickAnalysis<T extends { status?: string | null; updated_at?: string | null; created_at?: string | null }>(
  analyses: T | T[] | null | undefined
): T | undefined {
  const list = asArray(analyses);
  if (list.length <= 1) return list[0];
  return [...list].sort((a, b) => {
    const rank = (STATUS_RANK[b.status ?? ""] ?? 0) - (STATUS_RANK[a.status ?? ""] ?? 0);
    if (rank !== 0) return rank;
    const time = (x: T) => Date.parse(x.updated_at ?? x.created_at ?? "") || 0;
    return time(b) - time(a);
  })[0];
}

export const STALE_PROCESSING_MS = 10 * 60 * 1000;

export function isStaleProcessing(a: { status?: string | null; updated_at?: string | null; created_at?: string | null } | undefined, now = Date.now()): boolean {
  if (!a || a.status !== "processing") return false;
  const t = Date.parse(a.updated_at ?? a.created_at ?? "");
  return Number.isFinite(t) && now - t > STALE_PROCESSING_MS;
}
