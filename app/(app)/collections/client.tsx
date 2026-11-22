"use client";

import { toast } from "@/components/ui/toast";
import { useState } from "react";
import { createCollection, deleteCollection } from "@/app/actions/collections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash as Trash2 } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface CollectionData {
  id: string;
  name: string;
  description: string | null;
  items: { count: number }[];
}

export function CollectionsClient({ initialCollections }: { initialCollections: CollectionData[] }) {
  const router = useRouter();
  const collections = initialCollections;
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    
    const res = await createCollection(newName, newDesc);
    if (res?.error) {
      toast(res.error);
    } else {
      setNewName("");
      setNewDesc("");
      setIsCreating(false);
      router.refresh(); // MVP: Refresh to fetch from server
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this collection?")) return;
    const res = await deleteCollection(id);
    if (res?.error) {
      toast(res.error);
    } else {
      router.refresh();
    }
  };

  return (
    <div>
      <div className="mb-10">
        {!isCreating ? (
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="size-4" aria-hidden="true" /> Create collection
          </Button>
        ) : (
          <form onSubmit={handleCreate} className="max-w-md rounded-xl border border-border bg-card p-5">
            <h2 className="mb-5 text-xl font-semibold">New collection</h2>
            <div className="space-y-5">
              <div>
                <label htmlFor="collection-name" className="mb-1.5 block text-sm font-medium text-foreground">
                  Name
                </label>
                <Input
                  id="collection-name"
                  name="name"
                  autoComplete="off"
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="collection-description" className="mb-1.5 block text-sm font-medium text-foreground">
                  Description <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Input
                  id="collection-description"
                  name="description"
                  autoComplete="off"
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create collection</Button>
              </div>
            </div>
          </form>
        )}
      </div>

      {collections.length === 0 ? (
        <p className="text-base text-foreground">No collections yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => {
            const count = c.items[0]?.count || 0;
            return (
              <div
                key={c.id}
                className="group relative flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_6%)]"
              >
                <Link
                  href={`/collections/${c.id}`}
                  className="absolute inset-0 z-10 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label={`Open ${c.name}`}
                />

                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-foreground">{c.name}</h3>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete(c.id);
                    }}
                    aria-label={`Delete ${c.name}`}
                    className="relative z-20 -mr-2 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-destructive outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>

                {c.description && (
                  <p className="mt-2 line-clamp-2 text-base text-foreground">{c.description}</p>
                )}

                <p className="mt-6 text-sm text-muted-foreground">
                  {count} {count === 1 ? "item" : "items"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
