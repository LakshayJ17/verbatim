/**
 * Pure role helpers, safe to import from client and server code. Showing or
 * hiding UI with these is cosmetic; every admin page and action re-checks on
 * the server with requireAdmin() (utils/auth/admin.ts).
 */
export interface MaybeAdminUser {
  app_metadata?: { [key: string]: unknown } | null;
  is_anonymous?: boolean;
}

/** Admin = app_metadata.role === 'admin'. Users cannot edit app_metadata. */
export function isAdminUser(user: MaybeAdminUser | null | undefined): boolean {
  if (!user || user.is_anonymous) return false;
  return user.app_metadata?.role === "admin";
}
