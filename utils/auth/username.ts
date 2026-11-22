/**
 * Username helpers, shared by sign-up, the OAuth callback and the database
 * trigger (same rules as public.make_username() in the 20261121 migration).
 *
 * Before this, three places built usernames differently:
 *  - Google sign-in used the display name as-is ("Jane Doe", with a space),
 *  - email sign-up stripped every non a-z character, so "राहुल" became "482",
 *  - neither retried on a duplicate, and the insert error was ignored.
 * A failed profile insert left the account without a profile row, and every
 * later insert (sources, designs, posts) failed on its foreign key.
 */

export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

/** Lowercase ASCII slug from any name or email. Always 3..20 chars. */
export function baseUsername(input: string | null | undefined): string {
  const raw = String(input ?? "").split("@")[0];
  const slug = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20)
    .replace(/_+$/g, "");
  return slug.length >= 3 ? slug : `user${slug ? `_${slug}` : ""}`.slice(0, 20);
}

/** base + random 4-6 digit suffix, e.g. "jane_doe_4821". */
export function usernameCandidate(base: string, attempt: number): string {
  const digits = attempt < 3 ? 4 : 6;
  const suffix = Math.floor(Math.random() * 10 ** digits)
    .toString()
    .padStart(digits, "0");
  return `${base}_${suffix}`.slice(0, 30);
}

export function isValidUsername(value: string): boolean {
  return USERNAME_RE.test(value);
}
