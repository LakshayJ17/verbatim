/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata = {
  title: "Collection",
};

export default async function CollectionDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) return notFound();

  const { data: collection } = await supabase
    .from("collections")
    .select(`
      id, name, description,
      items:collection_items(
        id, item_type, added_at,
        quote:quotes(text, speaker_name),
        insight:insights(summary),
        post:posts(caption, visibility)
      )
    `)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!collection) return notFound();

  const typeLabel: Record<string, string> = { quote: "Quote", insight: "Insight", post: "Post" };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Collections", href: "/collections" }, { label: collection.name }]} />
      </div>

      <div className="mb-10">
        <h1 className="heading-display text-3xl">{collection.name}</h1>
        {collection.description && (
          <p className="mt-2 text-base text-muted-foreground">{collection.description}</p>
        )}
      </div>

      {collection.items.length === 0 ? (
        <p className="text-base text-foreground">This collection is empty.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {collection.items.map((item: any) => (
            <article key={item.id} className="flex flex-col rounded-xl border border-border bg-card p-5">
              <p className="mb-3 text-sm font-medium text-muted-foreground">
                {typeLabel[item.item_type] ?? item.item_type}
              </p>

              {item.item_type === "quote" && (
                <blockquote>
                  <p className="line-clamp-5 text-base text-foreground">
                    &ldquo;{item.quote?.text}&rdquo;
                  </p>
                  {item.quote?.speaker_name && (
                    <footer className="mt-2 text-base font-medium text-foreground">
                      {item.quote.speaker_name}
                    </footer>
                  )}
                </blockquote>
              )}
              {item.item_type === "insight" && (
                <p className="line-clamp-5 text-base text-foreground">{item.insight?.summary}</p>
              )}
              {item.item_type === "post" && (
                <p className="line-clamp-5 text-base text-foreground">{item.post?.caption}</p>
              )}

              <p className="mt-auto pt-5 text-sm text-muted-foreground">
                Added {new Date(item.added_at).toLocaleDateString()}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
