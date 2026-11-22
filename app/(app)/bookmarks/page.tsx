import { fetchBookmarks } from "@/app/actions/bookmarks";
import { DiscoverClient } from "@/app/(app)/discover/client";

export const metadata = {
  title: "Bookmarks",
  description: "Posts you saved from Commonplace.",
};

export default async function BookmarksPage() {
  // DiscoverClient's "Load more" pages through Discover, not bookmarks,
  // so load a generous first page here and do not hand it a cursor.
  const initialData = await fetchBookmarks(undefined, 100);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-10">
        <h1 className="heading-display text-3xl">Bookmarks</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Posts you saved from Commonplace. Only you can see this list.
        </p>
      </div>

      <DiscoverClient
        initialPosts={initialData.posts}
        emptyMessage="No bookmarks yet. Use the bookmark button on any post in Commonplace to save it here."
      />
    </div>
  );
}
