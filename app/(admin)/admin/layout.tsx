import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/utils/auth/admin";
import { AdminNav } from "@/components/admin/admin-nav";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin | Verbatim" },
  robots: { index: false, follow: false, nocache: true },
};

// Every admin page and action also calls requireAdmin() itself: layouts do
// not re-render on client navigation and do not stop child segments from
// rendering, so this check alone is not enough.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg font-semibold">
              <Link href="/admin" className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Verbatim admin
              </Link>
            </p>
            <p className="text-sm text-muted-foreground">
              Signed in as {user.email ?? user.id}.{" "}
              <Link href="/dashboard" className="underline underline-offset-4 hover:text-foreground">
                Back to the app
              </Link>
            </p>
          </div>
          <AdminNav />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
