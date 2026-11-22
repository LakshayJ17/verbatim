import { fetchDiscoverPosts } from "@/app/actions/discover";
import { DiscoverClient } from "./client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Commonplace",
  description: "The quote images people make with Verbatim and share with everyone: the lines worth keeping from what they watched.",
  alternates: { canonical: "/discover" },
  openGraph: {
    type: "website",
    siteName: "Verbatim",
    locale: "en_IN",
    url: "/discover",
    title: "Commonplace",
    description: "The quote images people make with Verbatim and share with everyone: the lines worth keeping from what they watched.",
    images: ["/opengraph-image"],
  },
  // Overrides the noindex set in app/(app)/layout.tsx.
  robots: { index: true, follow: true },
};

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category, q } = await searchParams;
  const initialData = await fetchDiscoverPosts(undefined, 10, category, q);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-10">
        <h1 className="heading-display text-3xl">Commonplace</h1>
        <p className="mt-2 text-base text-muted-foreground">
          The quote images people make with Verbatim and share with everyone. Like, save and comment on the lines
          worth keeping.
        </p>
      </div>

      <DiscoverClient
        key={`${category ?? ""}|${q ?? ""}`}
        initialPosts={initialData.posts}
        initialCursor={initialData.nextCursor}
        category={category}
        searchQuery={q}
        showFilters
      />
    </div>
  );
}
