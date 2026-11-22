import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { isAdminUser } from "./roles";

/**
 * Server-side admin guard for every admin page and admin server action.
 * Uses getUser(), which verifies the session with Supabase Auth (getSession
 * only decodes the cookie). Non-admins, guests and signed-out visitors get a
 * 404 so the admin area does not reveal that it exists.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user)) notFound();
  return user;
}
