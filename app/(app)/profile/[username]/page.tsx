/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import { DiscoverClient } from "@/app/(app)/discover/client";
import { ProfileClient } from "./client";
import { DiscoverPost } from "@/app/actions/discover";
import type { Metadata } from "next";
import { fillPostSources } from "@/utils/discover/sources";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const supabase = await createClient();

  // Same lookup as the page (username, then id) but with plain .eq() filters
  // so the route param is never interpolated into a PostgREST filter string.
  let { data: profile } = await supabase
    .from("profiles")
    .select("username, full_name, bio")
    .eq("username", username)
    .maybeSingle();
  if (!profile && UUID_RE.test(username)) {
    ({ data: profile } = await supabase
      .from("profiles")
      .select("username, full_name, bio")
      .eq("id", username)
      .maybeSingle());
  }

  if (!profile) {
    return { title: "Profile", robots: { index: false, follow: false } };
  }

  const name: string = profile.full_name || profile.username || "Profile";
  const bio: string = (profile.bio ?? "").replace(/\s+/g, " ").trim();
  const description = bio
    ? bio.length > 160
      ? `${bio.slice(0, 159).trimEnd()}\u2026`
      : bio
    : `Quotes and insights ${name} has published on Verbatim.`;
  const canonical = `/profile/${profile.username || username}`;

  return {
    title: name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      siteName: "Verbatim",
      locale: "en_IN",
      url: canonical,
      title: name,
      description,
      images: ["/opengraph-image"],
      ...(profile.username ? { username: profile.username } : {}),
    },
    // Overrides the noindex set in app/(app)/layout.tsx.
    robots: { index: true, follow: true },
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Find the profile by username, then by id. Plain .eq() filters keep the
  // route param from being interpreted as PostgREST filter syntax.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let { data: profile } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
  if (!profile && UUID_RE.test(username)) {
    ({ data: profile } = await supabase.from("profiles").select("*").eq("id", username).maybeSingle());
  }

  if (!profile) {
    return notFound();
  }

  // Fetch follower counts
  const { count: followersCount } = await supabase.from("follows").select("*", { count: 'exact', head: true }).eq("following_id", profile.id);
  const { count: followingCount } = await supabase.from("follows").select("*", { count: 'exact', head: true }).eq("follower_id", profile.id);
  
  let isFollowing = false;
  if (user && !user.is_anonymous && user.id !== profile.id) {
    const { data: follow } = await supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", profile.id).single();
    if (follow) isFollowing = true;
  }

  const isOwner = user?.id === profile.id;

  // Fetch published posts for this profile
  const { data: postsData } = await supabase
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
    .eq("user_id", profile.id)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(50);

  // Quick process for likes (MVP) - usually you'd paginate this properly
  let posts: DiscoverPost[] = [];
  
  if (postsData && postsData.length > 0) {
    await fillPostSources(supabase, postsData);
    const postIds = postsData.map(p => p.id);
    const { data: likes } = await supabase.from("likes").select("post_id, user_id").in("post_id", postIds);
    const { data: comments } = await supabase.from("comments").select("post_id").in("post_id", postIds);
    let bookmarks: any[] = [];
    if (user && !user.is_anonymous) {
      const { data: bookmarksData } = await supabase.from("bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id);
      bookmarks = bookmarksData || [];
    }

    posts = postsData.map((p: any) => {
      const postLikes = (likes || []).filter(l => l.post_id === p.id);
      const postComments = (comments || []).filter(c => c.post_id === p.id);
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
        comments_count: postComments.length,
        user_has_liked: user ? postLikes.some(l => l.user_id === user.id) : false,
        user_has_bookmarked: user ? bookmarks.some(b => b.post_id === p.id) : false
      };
    });
  }

  const stats = [
    { label: posts.length === 1 ? "post" : "posts", value: posts.length },
    { label: followersCount === 1 ? "follower" : "followers", value: followersCount || 0 },
    { label: "following", value: followingCount || 0 },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Profile header */}
      <div className="mb-12 flex flex-col items-center gap-6 md:flex-row md:items-start">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-full bg-muted md:size-32">
          {profile.avatar_url && (
            <Image src={profile.avatar_url} alt="" fill sizes="128px" className="object-cover" />
          )}
        </div>

        <div className="flex flex-1 flex-col items-center text-center md:items-start md:text-left">
          <h1 className="heading-display text-3xl">{profile.full_name || profile.username}</h1>
          <p className="mt-1 text-base text-muted-foreground">@{profile.username}</p>

          <ul className="mt-4 flex gap-6 text-base text-foreground">
            {stats.map((s) => (
              <li key={s.label}>
                <span className="font-semibold">{s.value}</span> {s.label}
              </li>
            ))}
          </ul>

          {profile.bio && <p className="mt-4 max-w-prose text-base text-foreground">{profile.bio}</p>}
        </div>

        <div className="flex flex-col items-center gap-2">
          <ProfileClient
            profileId={profile.id}
            isOwner={isOwner}
            initialIsFollowing={isFollowing}
            isGuest={!!(!user || user.is_anonymous)}
            initialProfile={{
              full_name: profile.full_name,
              username: profile.username,
              bio: profile.bio,
            }}
          />
        </div>
      </div>

      {/* Profile content */}
      <section aria-labelledby="published-heading">
        <h2 id="published-heading" className="heading-display mb-6 text-2xl">
          Published
        </h2>
        {posts.length === 0 ? (
          <p className="text-base text-foreground">
            {isOwner ? "You have not published anything yet." : "Nothing published yet."}
          </p>
        ) : (
          <DiscoverClient initialPosts={posts} />
        )}
      </section>
    </div>
  );
}
