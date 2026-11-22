"use server";

import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

const collectionSchema = z.object({
  name: z.string().trim().min(1, "Give the collection a name.").max(100, "Name is too long."),
  description: z.string().trim().max(500, "Description is too long.").optional(),
});

export async function fetchCollections() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) return [];

  const { data } = await supabase
    .from("collections")
    .select(`
      id,
      name,
      description,
      created_at,
      items:collection_items(count)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return data || [];
}

export async function createCollection(name: string, description?: string) {
  const parsed = collectionSchema.safeParse({ name, description: description || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid collection." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) return { error: "Unauthorized" };

  const { data, error } = await supabase
    .from("collections")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: "Failed to create collection" };

  revalidatePath("/collections");
  return { success: true, id: data.id };
}

export async function deleteCollection(id: string) {
  if (!z.uuid().safeParse(id).success) return { error: "Collection not found." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("collections")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: "Failed to delete collection" };

  revalidatePath("/collections");
  return { success: true };
}
