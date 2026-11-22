import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Discover, bookmarks, profiles and post pages embed
 * posts -> designs -> quotes -> analyses -> sources. sources and analyses
 * only have owner RLS policies, so for anyone but the author the embedded
 * source came back null: no source title or YouTube link, and the category
 * filter matched nothing for other people's posts.
 *
 * public_post_sources() (20261121 migration) returns just the public video
 * details (title, channel, link, categories) for public posts, and for an
 * unlisted post only when asked by its exact id. This fills the gaps in place.
 */

type Source = { title: string | null; creator_name: string | null; source_url: string | null; categories: string[] | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawPost = { id?: string; design?: any } | null | undefined;

function one<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

export async function fillPostSources(supabase: SupabaseClient, posts: RawPost[]): Promise<void> {
  const missing = posts.filter((p): p is { id: string; design: Record<string, unknown> } => {
    if (!p?.id || !p.design) return false;
    const design = one(p.design);
    const content = one(design?.quote) ?? one(design?.insight);
    return Boolean(content) && !one(one(content?.analysis)?.source);
  });
  if (missing.length === 0) return;

  const { data, error } = await supabase.rpc("public_post_sources", { p_post_ids: missing.map((p) => p.id).slice(0, 200) });
  if (error) {
    if (error.code !== "PGRST202" && error.code !== "42883") console.warn("[discover] public_post_sources failed:", error.message);
    return;
  }

  const byPost = new Map<string, Source>();
  for (const row of (data ?? []) as Array<Source & { post_id: string }>) {
    byPost.set(row.post_id, {
      title: row.title,
      creator_name: row.creator_name,
      source_url: row.source_url,
      categories: row.categories ?? [],
    });
  }

  for (const p of missing) {
    const source = byPost.get(p.id);
    if (!source) continue;
    const design = one(p.design) as Record<string, unknown>;
    for (const key of ["quote", "insight"] as const) {
      const content = one(design[key]) as Record<string, unknown> | undefined;
      if (content) content.analysis = { source };
    }
  }
}
