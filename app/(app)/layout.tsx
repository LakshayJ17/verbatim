import { AppShell } from "@/components/app-shell";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

// Signed-in app pages are private. Public pages in this group (discover,
// discover/[id], profile/[username]) override this with index: true.
// Metadata merges shallowly, so a child `robots` object replaces this one.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <AppShell user={user}>{children}</AppShell>;
}
