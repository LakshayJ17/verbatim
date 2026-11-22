/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from "@/utils/supabase/server";
import { DiscoverPost } from "@/app/actions/discover";
import { fillPostSources } from "@/utils/discover/sources";

export async function fetchBookmarks(cursor?: string, limit: number = 10) {
  limit = Math.min(Math.max(Math.trunc(Number(limit) || 10), 1), 100);
  if (cursor && Number.isNaN(Date.parse(cursor))) cursor = undefined;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) return { posts: [], nextCursor: undefined };

  let query = supabase
    .from("bookmarks")
    .select(`
      created_at,
      post:posts!post_id(
        id,
        user_id,
        design_id,
        caption,
        created_at,
        visibility,
        author:profiles!user_id(username, full_name, avatar_url),
        design:designs!design_id(
          rendered_image_url,
          configuration,
          quote:quotes(
            text,
            speaker_name,
            analysis:analyses(
              source:sources(title, creator_name, source_url, categories)
            )
          ),
          insight:insights(
            summary,
            analysis:analyses(
              source:sources(title, creator_name, source_url, categories)
            )
          )
        )
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error(error);
    return { posts: [], nextCursor: undefined };
  }

  // Only public posts are listed. RLS hides other people's non-public posts
  // (post is null), but the user's own private or unlisted posts are still
  // readable, so filter on visibility explicitly.
  const validBookmarks = data.filter(b => b.post != null && (b.post as any).visibility === 'public');

  await fillPostSources(supabase, validBookmarks.map((b) => b.post as any));

  const postIds = validBookmarks.map(b => (b.post as any).id);
  
  let likes: any[] = [];
  const commentsCounts: Record<string, number> = {};

  if (postIds.length > 0) {
    const { data: likesData } = await supabase.from("likes").select("post_id, user_id").in("post_id", postIds);
    likes = likesData || [];
    
    const { data: commentsData } = await supabase.from("comments").select("post_id").in("post_id", postIds);
    if (commentsData) {
      commentsData.forEach(c => {
        commentsCounts[c.post_id] = (commentsCounts[c.post_id] || 0) + 1;
      });
    }
  }

  const posts: DiscoverPost[] = validBookmarks.map((b: any) => {
    const p = b.post;
    const postLikes = likes.filter(l => l.post_id === p.id);
    return {
      id: p.id,
      user_id: p.user_id,
      design_id: p.design_id,
      caption: p.caption,
      created_at: p.created_at,
      author: p.author,
      design: {
        rendered_image_url: p.design.rendered_image_url,
        configuration: p.design.configuration,
        quote: p.design.quote ? {
          text: p.design.quote.text,
          speaker: p.design.quote.speaker_name,
          analysis: p.design.quote.analysis
        } : undefined,
        insight: p.design.insight ? {
          content: p.design.insight.summary,
          analysis: p.design.insight.analysis
        } : undefined
      },
      likes_count: postLikes.length,
      comments_count: commentsCounts[p.id] || 0,
      user_has_liked: postLikes.some(l => l.user_id === user.id),
      user_has_bookmarked: true
    };
  });

  const nextCursor = data.length === limit ? data[data.length - 1].created_at : undefined;

  return { posts, nextCursor };
}
