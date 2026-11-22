/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";


import { toast } from "@/components/ui/toast";
import { useState } from "react";
import { toggleLike, toggleBookmark } from "@/app/actions/social";
import { addComment, deleteComment } from "@/app/actions/comments";
import { deletePost } from "@/app/actions/publish";
import { Heart, BookmarkSimple as Bookmark, ChatCircle as MessageSquare, Trash as Trash2, PaperPlaneRight as Send } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReportControl } from "@/components/report-control";
import { cn } from "cn";

interface PostDetailClientProps {
  postId: string;
  initialLikes: number;
  initialUserLiked: boolean;
  initialUserBookmarked: boolean;
  initialComments: any[];
  currentUserId?: string;
  isOwner: boolean;
}

export function PostDetailClient({ 
  postId, 
  initialLikes, 
  initialUserLiked, 
  initialUserBookmarked, 
  initialComments,
  currentUserId,
  isOwner
}: PostDetailClientProps) {
  const router = useRouter();
  
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(initialUserLiked);
  const [bookmarked, setBookmarked] = useState(initialUserBookmarked);
  // Rendered straight from props: router.refresh() after adding or deleting
  // a comment delivers the new list. (Copying it into state froze the list, so
  // new comments only appeared after a full reload.)
  const comments = initialComments;
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLike = async () => {
    if (!currentUserId) return toast("Log in to like this post.");
    
    // Optimistic
    setLiked(!liked);
    setLikes(prev => prev + (liked ? -1 : 1));

    const res = await toggleLike(postId);
    if (res?.error) {
      setLiked(liked);
      setLikes(initialLikes);
      toast(res.error);
    }
  };

  const handleBookmark = async () => {
    if (!currentUserId) return toast("Log in to bookmark this post.");
    
    setBookmarked(!bookmarked);
    const res = await toggleBookmark(postId);
    if (res?.error) {
      setBookmarked(bookmarked);
      toast(res.error);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) return toast("Log in to comment.");
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await addComment(postId, newComment);
      if (res?.error) {
        toast(res.error);
      } else {
        setNewComment("");
        router.refresh();
      }
    } catch {
      toast("Could not post your comment. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("Delete this comment?")) return;
    const res = await deleteComment(commentId, postId);
    if (res?.error) {
      toast(res.error);
    } else {
      router.refresh();
    }
  };

  const handleUnpublish = async () => {
    if (!confirm("Unpublish this post? It will be removed from Discover but remain in your Library.")) return;
    
    // Unpublishing removes the post row; the design stays in the Library.
    const res = await deletePost(postId);
    if (res?.error) {
      toast(res.error);
    } else {
      router.push("/discover");
    }
  };

  const iconButton =
    "flex h-10 items-center gap-2 rounded-md px-2.5 text-base text-foreground transition-colors hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Interaction bar */}
      <div className="mb-6 flex items-center justify-between rounded-md bg-muted px-2 py-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLike}
            aria-label={liked ? "Unlike" : "Like"}
            aria-pressed={liked}
            className={cn(iconButton, "hover:bg-background")}
          >
            <Heart weight={liked ? "fill" : "regular"} className={cn("size-5", liked && "text-destructive")} aria-hidden="true" />
            <span className="font-medium">{likes}</span>
          </button>

          <div className="flex h-10 items-center gap-2 px-2.5 text-base text-foreground">
            <MessageSquare className="size-5" aria-hidden="true" />
            <span className="font-medium">{comments.length}</span>
            <span className="sr-only">comments</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleBookmark}
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark"}
            aria-pressed={bookmarked}
            className={cn(iconButton, "hover:bg-background")}
          >
            <Bookmark weight={bookmarked ? "fill" : "regular"} className="size-5" aria-hidden="true" />
          </button>

          {isOwner && (
            <button
              type="button"
              onClick={handleUnpublish}
              aria-label="Unpublish post"
              title="Unpublish post"
              className={cn(iconButton, "hover:bg-background hover:text-destructive")}
            >
              <Trash2 className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {currentUserId && !isOwner && (
        <ReportControl targetType="post" targetId={postId} label="Report post" className="-mt-4 mb-6" />
      )}

      <h2 className="mb-4 text-xl font-semibold">Comments</h2>

      {/* Comments list */}
      <div className="min-h-[200px] flex-1 space-y-6 overflow-y-auto pb-6">
        {comments.length === 0 ? (
          <p className="text-base text-muted-foreground">No comments yet.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="group flex gap-3">
              <div className="relative mt-1 size-8 shrink-0 overflow-hidden rounded-full bg-muted">
                {c.author.avatar_url && (
                  <Image src={c.author.avatar_url} alt="" fill sizes="32px" className="object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold text-foreground">
                    {c.author.full_name || c.author.username}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 text-base whitespace-pre-wrap text-foreground">{c.content}</p>
                {currentUserId && currentUserId !== c.user_id && (
                  <ReportControl targetType="comment" targetId={c.id} label="Report" className="mt-1 -ml-2" />
                )}
              </div>
              {currentUserId === c.user_id && (
                <button
                  type="button"
                  onClick={() => handleDeleteComment(c.id)}
                  aria-label="Delete comment"
                  className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Comment input */}
      {currentUserId ? (
        <form onSubmit={handleAddComment} className="mt-4 flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="new-comment" className="sr-only">
              Add a comment
            </label>
            <Input
              id="new-comment"
              name="comment"
              type="text"
              autoComplete="off"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment…"
              maxLength={500}
            />
          </div>
          <Button
            type="submit"
            disabled={isSubmitting || !newComment.trim()}
            size="icon-lg"
            aria-label="Post comment"
          >
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </form>
      ) : (
        <p className="mt-4 text-base text-muted-foreground">Log in to leave a comment.</p>
      )}
    </div>
  );
}
