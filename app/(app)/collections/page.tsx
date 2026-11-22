import { fetchCollections } from "@/app/actions/collections";
import { CollectionsClient } from "./client";

export const metadata = {
  title: "Collections",
  description: "Group saved quotes, insights and posts.",
};

export default async function CollectionsPage() {
  const collections = await fetchCollections();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-10">
        <h1 className="heading-display text-3xl">Collections</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Group saved quotes, insights and posts.
        </p>
      </div>

      <CollectionsClient initialCollections={collections} />
    </div>
  );
}
