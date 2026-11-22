"use server";

import { createClient } from "@/utils/supabase/server";

export async function fetchDashboardData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) return null;

  // Fetch recent sources
  const { data: recentSources } = await supabase
    .from("sources")
    .select(`
      id, title, creator_name, created_at,
      analyses(id, status, updated_at, created_at)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(3);

  // Fetch recent designs
  const { data: recentDesigns } = await supabase
    .from("designs")
    .select(`
      id, created_at, rendered_image_url,
      quote:quotes(text, speaker_name),
      insight:insights(summary)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(3);

  // Fetch recent posts
  const { data: recentPosts } = await supabase
    .from("posts")
    .select(`
      id, created_at, visibility, caption
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(3);

  // Fetch collections
  const { data: collections } = await supabase
    .from("collections")
    .select(`id, name`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(4);

  return {
    recentSources: recentSources || [],
    recentDesigns: recentDesigns || [],
    recentPosts: recentPosts || [],
    collections: collections || []
  };
}
