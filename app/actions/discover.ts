/* eslint-disable @typescript-eslint/no-explicit-any */

"use server";

import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { fillPostSources } from "@/utils/discover/sources";

// This is a server action, so every argument is untrusted client input.
const feedArgsSchema = z.object({
  cursor: z.iso.datetime({ offset: true }).optional(),
  limit: z.number().int().min(1).max(30),
  category: z.string().trim().max(64).optional(),
  searchQuery: z.string().trim().max(200).optional(),
});

export interface DiscoverPost {
  id: string;
  user_id: string;
  design_id: string;
  caption: string | null;
  created_at: string;
  author: {
    username: string;
    full_name: string;
    avatar_url: string;
  };
  design: {
    rendered_image_url: string;
    configuration: any;
    quote?: {
      text: string;
      speaker: string;
      analysis: {
        source: {
          title: string;
          creator_name: string;
          source_url: string;
          categories: string[];
        }
      }
    };
    insight?: {
      content: string;
      analysis: {
        source: {
          title: string;
          creator_name: string;
          source_url: string;
          categories: string[];
        }
      }
    }
  };
  likes_count: number;
  comments_count: number;
  user_has_liked: boolean;
  user_has_bookmarked: boolean;
}

export async function fetchDiscoverPosts(
  cursor?: string, 
  limit: number = 10,
  category?: string,
  searchQuery?: string
) {
  const args = feedArgsSchema.safeParse({
    cursor: cursor || undefined,
    limit: Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 30) : 10,
    category: category ? String(category).slice(0, 64) : undefined,
    searchQuery: searchQuery ? String(searchQuery).slice(0, 200) : undefined,
  });
  if (!args.success) return { posts: [], nextCursor: undefined };
  ({ cursor, limit, category, searchQuery } = args.data);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Only 'public' posts are listed. 'unlisted' posts are reachable by direct
  // link only and 'private' posts by their owner only, so neither may appear here.
  let query = supabase
    .from("posts")
    .select(`
      id,
      user_id,
      design_id,
      caption,
      created_at,
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
    `)
    .eq("visibility", "public")
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

  // Source details aren't readable through RLS for other people's posts.
  await fillPostSources(supabase, data);

  // Post-process the data
  const postIds = data.map(p => p.id);
  
  let likes: any[] = [];
  let bookmarks: any[] = [];
  const commentsCounts: Record<string, number> = {};

  if (postIds.length > 0) {
    // Fetch likes counts
    const { data: likesData } = await supabase.from("likes").select("post_id, user_id").in("post_id", postIds);
    likes = likesData || [];
    
    // Fetch comments counts
    const { data: commentsData } = await supabase.from("comments").select("post_id").in("post_id", postIds);
    if (commentsData) {
      commentsData.forEach(c => {
        commentsCounts[c.post_id] = (commentsCounts[c.post_id] || 0) + 1;
      });
    }

    if (user && !user.is_anonymous) {
      const { data: bookmarksData } = await supabase.from("bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id);
      bookmarks = bookmarksData || [];
    }
  }

  const posts: DiscoverPost[] = data.map((p: any) => {
    const postLikes = likes.filter(l => l.post_id === p.id);
    const userLiked = user ? postLikes.some(l => l.user_id === user.id) : false;
    const userBookmarked = user ? bookmarks.some(b => b.post_id === p.id) : false;

    // Filter by category in-memory for MVP
    const source = p.design?.quote?.analysis?.source || p.design?.insight?.analysis?.source;
    if (category && (!source?.categories || !source.categories.includes(category))) {
      return null;
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const textMatch = 
        (p.design?.quote?.text?.toLowerCase().includes(q)) || 
        (p.design?.insight?.summary?.toLowerCase().includes(q)) ||
        (source?.title?.toLowerCase().includes(q)) ||
        (source?.creator_name?.toLowerCase().includes(q));
      if (!textMatch) return null;
    }

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
      user_has_liked: userLiked,
      user_has_bookmarked: userBookmarked
    };
  }).filter(Boolean) as DiscoverPost[];

  const nextCursor = data.length === limit ? data[data.length - 1].created_at : undefined;

  return { posts, nextCursor };
}
