"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SquaresFour as LayoutDashboard, Compass, Books as Library, PlusCircle, List as Menu, X, SignOut as LogOut, BookmarkSimple as Bookmark, FolderSimple as FolderHeart, GearSix as Settings } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { logout } from "@/app/actions/auth";
import type { User } from "@supabase/supabase-js";
import { ChatText, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { isAdminUser } from "@/utils/auth/roles";

const sidebarLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/discover", label: "Commonplace", icon: Compass },
  { href: "/library", label: "Library", icon: Library },
  { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
  { href: "/collections", label: "Collections", icon: FolderHeart },
  { href: "/dashboard/new", label: "Make quote images", icon: PlusCircle },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

// Shown only to admins. Cosmetic: /admin re-checks the role on the server.
const adminLink = { href: "/admin", label: "Admin", icon: ShieldCheck } as const;

export function AppShell({ children, user }: { children: React.ReactNode; user: User | null }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const links = isAdminUser(user) ? [...sidebarLinks, adminLink] : sidebarLinks;

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSidebarOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);
  
  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map((n: string) => n[0]).join("")
    : user?.email?.charAt(0).toUpperCase() || "U";
    
  const displayName = user?.user_metadata?.full_name || "User";

  return (
    <div className="flex min-h-dvh">
      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden w-64 shrink-0 bg-sidebar md:block">
        <div className="sticky top-0 flex h-dvh flex-col">
          {/* Logo */}
          <div className="flex h-20 items-center px-6">
            <Link href="/" className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="heading-display text-3xl text-foreground">
                Verbatim
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav aria-label="App" className="flex-1 space-y-1 px-3 py-2">
            {links.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href !== "/dashboard" &&
                  pathname.startsWith(link.href + "/"));

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative flex h-11 items-center gap-3 rounded-md px-3 text-base font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive
                      ? "bg-sidebar-accent text-foreground"
                      : "text-foreground/80 hover:bg-sidebar-accent hover:text-foreground"
                  }`}
                >
                  <link.icon className="size-[18px]" aria-hidden="true" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="p-3">
            <Link
              href={`/profile/${user?.id}`}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-sidebar-accent"
            >
              <Avatar className="size-9 rounded-md after:rounded-md">
                <AvatarFallback className="rounded-md bg-tag-blue text-sm font-semibold text-tag-blue-fg">{userInitials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium text-foreground">
                  {displayName}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {user?.email}
                </p>
              </div>
            </Link>
            <Link
              href="/feedback?from=/dashboard"
              className="flex h-11 items-center gap-3 rounded-md px-3 text-base text-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              <ChatText className="size-[18px]" aria-hidden="true" />
              Send feedback
            </Link>
            <form action={logout} className="mt-1">
              <button className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-base text-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-destructive">
                <LogOut className="size-[18px]" aria-hidden="true" />
                Log out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* ── Mobile header ── */}
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between bg-sidebar px-4 md:hidden">
          <Link href="/">
            <span className="heading-display text-2xl text-foreground">
              Verbatim
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          >
            {sidebarOpen ? (
              <X className="size-5" />
            ) : (
              <Menu className="size-5" />
            )}
          </Button>
        </header>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 md:hidden">
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-ink/30"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="absolute left-0 top-16 h-[calc(100%-4rem)] w-72 overflow-y-auto overscroll-contain bg-sidebar">
              <nav aria-label="App" className="space-y-1 px-3 py-4">
                {links.map((link) => {
                  const isActive =
                    pathname === link.href ||
                    (link.href !== "/dashboard" &&
                      pathname.startsWith(link.href + "/"));

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setSidebarOpen(false)}
                      aria-current={isActive ? "page" : undefined}
                      className={`relative flex h-12 items-center gap-3 rounded-md px-3 text-base font-medium transition-colors ${
                        isActive
                          ? "bg-sidebar-accent text-foreground"
                          : "text-foreground/80 hover:bg-sidebar-accent hover:text-foreground"
                      }`}
                    >
                      <link.icon className="size-[18px]" aria-hidden="true" />
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </aside>
          </div>
        )}

        {/* ── Main content ── */}
        <main id="main" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      </div>
    </div>
  );
}
