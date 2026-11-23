import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { absoluteUrl } from "@/components/seo/json-ld";

// Regenerate at most once an hour.
export const revalidate = 3600;

const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/discover", changeFrequency: "daily", priority: 0.8 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/cookies", changeFrequency: "yearly", priority: 0.3 },
];

/**
 * Public posts, read with the anon key (RLS "Public read" policy allows
 * visibility = 'public'). Uses supabase-js directly rather than the cookie-based
 * server client so the sitemap stays cacheable and needs no request context.
 * Never throws: on any failure the sitemap falls back to static routes only.
 */
async function getPublicPosts(): Promise<MetadataRoute.Sitemap> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from("posts")
      .select("id, created_at")
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error || !data) return [];

    return data.map((post) => ({
      url: absoluteUrl(`/discover/${post.id}`),
      lastModified: post.created_at ? new Date(post.created_at) : undefined,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  return [...staticEntries, ...(await getPublicPosts())];
}
