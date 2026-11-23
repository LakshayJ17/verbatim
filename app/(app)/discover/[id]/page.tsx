/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { PostDetailClient } from "./client";
import type { Metadata } from "next";
import { fillPostSources } from "@/utils/discover/sources";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Loads a post that may be shown at /discover/[id]: 'public' or 'unlisted',
 * never 'private'. RLS lets anyone read public posts and owners read their own.
 * Unlisted posts are deliberately not readable through RLS (that would let
 * anyone enumerate them through the API), so they come from the
 * get_unlisted_post() database function, which returns one unlisted post by
 * exact id, shaped like the select below. Whoever has the link can view it.
 * No service role key is involved.
 */
async function fetchViewablePost(supabase: ServerSupabase, id: string, columns: string) {
  if (!UUID_RE.test(id)) return null;
  const { data } = await supabase
    .from("posts")
    .select(`visibility, ${columns}`)
    .eq("id", id)
    .in("visibility", ["public", "unlisted"])
    .maybeSingle();
  if (data) {
    // Source details aren't readable through RLS for other people's posts.
    await fillPostSources(supabase, [data as any]);
    return data as any;
  }

  const { data: unlisted, error } = await supabase.rpc("get_unlisted_post", { p_id: id });
  if (error) {
    console.error("[discover] get_unlisted_post failed:", error.message);
    return null;
  }
  return (unlisted as any) ?? null;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 3).trimEnd()}...` : clean;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  // Lighter version of the page query: only the fields metadata needs.
  const data = await fetchViewablePost(supabase, id, `
      id,
      design:designs!design_id(
        rendered_image_url,
        quote:quotes(
          text,
          speaker_name,
          analysis:analyses(source:sources(title, creator_name))
        ),
        insight:insights(
          summary,
          analysis:analyses(source:sources(title, creator_name))
        )
      )
    `);

  const post = data as any;
  if (!post?.design) {
    return { title: "Post", robots: { index: false, follow: false } };
  }

  const isQuote = !!post.design.quote;
  const text: string = (isQuote ? post.design.quote?.text : post.design.insight?.summary) ?? "";
  const speaker: string | undefined = post.design.quote?.speaker_name || undefined;
  const source = isQuote ? post.design.quote?.analysis?.source : post.design.insight?.analysis?.source;
  const sourceTitle: string | undefined = source?.title || undefined;

  const title = text
    ? isQuote
      ? `\u201c${truncate(text, 60)}\u201d${speaker ? ` by ${speaker}` : ""}`
      : truncate(text, 70)
    : isQuote
      ? "Quote"
      : "Insight";

  const attribution = [speaker ? `${speaker}` : null, sourceTitle ? `from ${sourceTitle}` : null]
    .filter(Boolean)
    .join(", ");
  const description = truncate(
    text
      ? `${isQuote ? `\u201c${text}\u201d` : text}${attribution ? ` (${attribution})` : ""}`
      : "A quote checked against the transcript on Verbatim.",
    160
  );

  const canonical = `/discover/${post.id}`;
  const imageUrl: string | undefined = post.design.rendered_image_url || undefined;
  const images = imageUrl ? [{ url: imageUrl, alt: truncate(text || title, 100) }] : ["/opengraph-image"];

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      siteName: "Verbatim",
      locale: "en_IN",
      url: canonical,
      title,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images,
    },
    // Public posts override the noindex set in app/(app)/layout.tsx.
    // Unlisted posts stay out of search engines.
    robots: post.visibility === "public" ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch the post
  const rawPost = await fetchViewablePost(supabase, id, `
      id,
      user_id,
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
    `);

  const post = rawPost as any;

  if (!post) {
    return notFound();
  }

  // Fetch comments
  const { data: commentsData } = await supabase
    .from("comments")
    .select(`
      id,
      user_id,
      content,
      created_at,
      author:profiles!user_id(username, full_name, avatar_url)
    `)
    .eq("post_id", id)
    .order("created_at", { ascending: true });

  // Like count and the viewer's like/bookmark state. Bookmarks are private
  // (owners only, by RLS), so there is no public bookmark count.
  const { count: likesCount } = await supabase.from("likes").select("*", { count: 'exact', head: true }).eq("post_id", id);
  
  let userLiked = false;
  let userBookmarked = false;

  if (user && !user.is_anonymous) {
    const { data: like } = await supabase.from("likes").select("post_id").eq("post_id", id).eq("user_id", user.id).maybeSingle();
    if (like) userLiked = true;

    const { data: bookmark } = await supabase.from("bookmarks").select("post_id").eq("post_id", id).eq("user_id", user.id).maybeSingle();
    if (bookmark) userBookmarked = true;
  }

  const isQuote = !!post.design.quote;
  const contentSource = isQuote ? post.design.quote?.analysis?.source : post.design.insight?.analysis?.source;
  const contentText = isQuote ? post.design.quote?.text : post.design.insight?.summary;
  const speaker: string | undefined = post.design.quote?.speaker_name;

  const currentUserId = user?.is_anonymous ? null : user?.id;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-5">
        {/* Graphic */}
        <div className="flex justify-center lg:col-span-3">
          {post.design.rendered_image_url ? (
            <div className="relative aspect-square w-full max-w-2xl overflow-hidden rounded-md bg-muted">
              <Image
                src={post.design.rendered_image_url}
                alt={contentText?.substring(0, 100) || "Post graphic"}
                fill
                priority
                sizes="(min-width: 1024px) 60vw, 100vw"
                className="object-cover"
              />
            </div>
          ) : (
            <div className="flex aspect-square w-full max-w-2xl flex-col justify-end rounded-md bg-muted p-10">
              <span className="text-xl font-semibold text-foreground">Graphic unavailable</span>
              <span className="mt-2 text-base text-muted-foreground">This older post has no saved image.</span>
            </div>
          )}
        </div>

        {/* Meta and comments */}
        <div className="flex h-full flex-col lg:col-span-2">
          <div className="mb-8 flex items-center gap-3">
            <div className="relative size-11 shrink-0 overflow-hidden rounded-full bg-muted">
              {post.author.avatar_url && (
                <Image src={post.author.avatar_url} alt="" fill sizes="44px" className="object-cover" />
              )}
            </div>
            <Link
              href={`/profile/${post.author.username || post.user_id}`}
              className="text-lg font-semibold text-foreground hover:underline underline-offset-4"
            >
              {post.author.full_name || post.author.username || "Creator"}
            </Link>
          </div>

          {/* Source attribution */}
          <div className="mb-8 rounded-xl border border-border bg-card p-5">
            <p className="text-base font-medium text-foreground">
              {isQuote ? (speaker ? `Quote by ${speaker}` : "Quote") : "Insight"}
            </p>

            {contentSource && (
              <div className="mt-5">
                <p className="text-sm text-muted-foreground">Source</p>
                <p className="mt-1 text-base font-medium text-foreground">{contentSource.title}</p>
                {contentSource.creator_name && (
                  <p className="text-base text-foreground">{contentSource.creator_name}</p>
                )}

                {contentSource.source_url && (
                  <a
                    href={contentSource.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-base text-foreground underline underline-offset-4 hover:decoration-2"
                  >
                    Watch on YouTube
                  </a>
                )}
              </div>
            )}
          </div>

          <PostDetailClient
            postId={post.id}
            initialLikes={likesCount || 0}
            initialUserLiked={userLiked}
            initialUserBookmarked={userBookmarked}
            initialComments={commentsData || []}
            currentUserId={currentUserId || undefined}
            isOwner={currentUserId === post.user_id}
          />
        </div>
      </div>
    </div>
  );
}
