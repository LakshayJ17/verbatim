"use client";

import { toast } from "@/components/ui/toast";
import { useState, useTransition } from "react";
import { DiscoverPost, fetchDiscoverPosts } from "@/app/actions/discover";
import { toggleLike, toggleBookmark } from "@/app/actions/social";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MagnifyingGlass as Search, Heart, BookmarkSimple as Bookmark, CircleNotch as Loader2 } from "@phosphor-icons/react/dist/ssr";
import { ALLOWED_CATEGORIES } from "@/utils/source/categories";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { cn } from "cn";

interface DiscoverClientProps {
  initialPosts: DiscoverPost[];
  initialCursor?: string;
  category?: string;
  searchQuery?: string;
  showFilters?: boolean;
  emptyMessage?: string;
}

// The most common topics get a button; the rest live in a dropdown.
const PRIMARY_CATEGORIES = ["Technology", "Business", "Science", "Self Improvement", "Health", "Education"] as const;
const MORE_CATEGORIES = ALLOWED_CATEGORIES.filter(
  (c) => !(PRIMARY_CATEGORIES as readonly string[]).includes(c)
);

function buildDiscoverUrl(category: string, q: string) {
  const params = new URLSearchParams();
  if (category && category !== "All") params.set("category", category);
  if (q.trim()) params.set("q", q.trim());
  const qs = params.toString();
  return qs ? `/discover?${qs}` : "/discover";
}

export function DiscoverClient({
  initialPosts,
  initialCursor,
  category = "All",
  searchQuery = "",
  showFilters = false,
  emptyMessage = "Nothing published yet.",
}: DiscoverClientProps) {
  const router = useRouter();

  const [posts, setPosts] = useState<DiscoverPost[]>(initialPosts);
  const [cursor, setCursor] = useState<string | undefined>(initialCursor);
  const [loading, setLoading] = useState(false);
  const activeSearch = searchQuery;
  // Show the clicked filter immediately; the server results follow.
  const [isPending, startTransition] = useTransition();
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const activeCategory = isPending && pendingCategory ? pendingCategory : category;

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const { posts: newPosts, nextCursor } = await fetchDiscoverPosts(
        cursor,
        10,
        activeCategory === "All" ? undefined : activeCategory,
        activeSearch || undefined
      );
      setPosts((prev) => [...prev, ...newPosts]);
      setCursor(nextCursor);
    } catch (e) {
      console.error(e);
      toast("Could not load more posts. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = (new FormData(e.currentTarget).get("q") as string) || "";
    router.push(buildDiscoverUrl(activeCategory, q));
  };

  const handleCategory = (cat: string) => {
    if (cat === activeCategory) return;
    setPendingCategory(cat);
    startTransition(() => router.push(buildDiscoverUrl(cat, activeSearch), { scroll: false }));
  };

  const handleLike = async (postId: string) => {
    const postIndex = posts.findIndex((p) => p.id === postId);
    if (postIndex === -1) return;

    // Optimistic UI
    const originalPost = posts[postIndex];
    const newPosts = [...posts];
    newPosts[postIndex] = {
      ...originalPost,
      user_has_liked: !originalPost.user_has_liked,
      likes_count: originalPost.likes_count + (originalPost.user_has_liked ? -1 : 1),
    };
    setPosts(newPosts);

    const res = await toggleLike(postId);
    if (res?.error) {
      toast(res.error);
      setPosts(posts);
    }
  };

  const handleBookmark = async (postId: string) => {
    const postIndex = posts.findIndex((p) => p.id === postId);
    if (postIndex === -1) return;

    // Optimistic UI
    const originalPost = posts[postIndex];
    const newPosts = [...posts];
    newPosts[postIndex] = {
      ...originalPost,
      user_has_bookmarked: !originalPost.user_has_bookmarked,
    };
    setPosts(newPosts);

    const res = await toggleBookmark(postId);
    if (res?.error) {
      toast(res.error);
      setPosts(posts);
    }
  };

  return (
    <div>
      {showFilters && (
        <>
          <form onSubmit={handleSearch} role="search" className="mb-6">
            <label htmlFor="discover-search" className="sr-only">
              Search Discover
            </label>
            <div className="relative max-w-xl">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="discover-search"
                name="q"
                type="search"
                defaultValue={activeSearch}
                placeholder="Search quotes, speakers or sources..."
                autoComplete="off"
                className="pl-10"
              />
            </div>
          </form>

          <div className="mb-10 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by category">
            {["All", ...PRIMARY_CATEGORIES, ...(MORE_CATEGORIES.includes(activeCategory as never) ? [activeCategory] : [])].map(
              (cat) => {
                const isActive = cat === activeCategory;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleCategory(cat)}
                    aria-pressed={isActive}
                    className={cn(
                      "press h-10 shrink-0 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isActive ? "bg-foreground text-background" : "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-surface"
                    )}
                  >
                    {cat}
                  </button>
                );
              }
            )}
            <label htmlFor="discover-more-topics" className="sr-only">
              More topics
            </label>
            <select
              id="discover-more-topics"
              value=""
              onChange={(e) => e.target.value && handleCategory(e.target.value)}
              className="h-10 rounded-lg border border-input/40 bg-card px-3 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">More topics</option>
              {MORE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {posts.length === 0 ? (
        <p className="py-16 text-base text-foreground">{emptyMessage}</p>
      ) : (
        <div
          aria-busy={isPending}
          className={cn(
            "grid gap-x-8 gap-y-12 transition-opacity duration-200 md:grid-cols-2 lg:grid-cols-3",
            isPending && "opacity-50"
          )}
        >
          {posts.map((post) => {
            const isQuote = !!post.design.quote;
            const contentSource = isQuote
              ? post.design.quote?.analysis?.source
              : post.design.insight?.analysis?.source;
            const contentText = isQuote ? post.design.quote?.text : post.design.insight?.content;
            const authorName = post.author.full_name || post.author.username || "Creator";

            return (
              <article key={post.id} className="group relative flex flex-col gap-4">
                <Link
                  href={`/discover/${post.id}`}
                  className="absolute inset-0 z-10 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label={`Open post by ${authorName}`}
                />

                {post.design.rendered_image_url ? (
                  <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted transition-opacity group-hover:opacity-90">
                    <Image
                      src={post.design.rendered_image_url}
                      alt={contentText?.substring(0, 80) || "Post graphic"}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-square w-full flex-col justify-end rounded-md bg-muted p-6">
                    <span className="text-base font-medium text-foreground">Graphic unavailable</span>
                    <span className="mt-1 text-sm text-muted-foreground">
                      This older post has no saved image.
                    </span>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <div className="relative z-20 flex items-center justify-between gap-3">
                    <Link
                      href={`/profile/${post.author.username || post.user_id}`}
                      className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground hover:underline underline-offset-4"
                    >
                      <span className="relative size-6 shrink-0 overflow-hidden rounded-full bg-muted">
                        {post.author.avatar_url && (
                          <Image
                            src={post.author.avatar_url}
                            alt=""
                            fill
                            sizes="24px"
                            className="object-cover"
                          />
                        )}
                      </span>
                      <span className="truncate">{authorName}</span>
                    </Link>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleLike(post.id)}
                        aria-label={post.user_has_liked ? "Unlike" : "Like"}
                        aria-pressed={post.user_has_liked}
                        className="flex h-9 items-center gap-1.5 rounded-md px-2 text-sm text-foreground transition-colors hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Heart
                          weight={post.user_has_liked ? "fill" : "regular"}
                          className={cn("size-5", post.user_has_liked && "text-destructive")}
                          aria-hidden="true"
                        />
                        <span>{post.likes_count}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBookmark(post.id)}
                        aria-label={post.user_has_bookmarked ? "Remove bookmark" : "Bookmark"}
                        aria-pressed={post.user_has_bookmarked}
                        className="flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Bookmark
                          weight={post.user_has_bookmarked ? "fill" : "regular"}
                          className="size-5"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>

                  <p className="line-clamp-1 text-sm text-foreground">
                    {isQuote
                      ? post.design.quote?.speaker
                        ? `Quote by ${post.design.quote.speaker}`
                        : "Quote"
                      : "Insight"}
                  </p>

                  {contentSource?.title && (
                    <p className="line-clamp-1 text-sm text-muted-foreground">{contentSource.title}</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {cursor && (
        <div className="mt-12 flex justify-center">
          <Button variant="secondary" onClick={loadMore} disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {loading ? "Loading" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
