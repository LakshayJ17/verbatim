/**
 * Sign-in errors travel in the URL as short codes (?error=auth_failed), never
 * as text. The pages show only these fixed messages, so a crafted link can't
 * put an attacker's words ("Your account is locked, call...") in the alert box.
 */
const AUTH_ERRORS = {
  auth_failed: "We couldn't sign you in. Please try again.",
  guest_unavailable: "Guest access is unavailable right now. Please sign in with Google or create an account.",
  guest_limit: "Too many guest sessions from this network. Please try again later, or create an account.",
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERRORS;

/** The message for a ?error= code; anything unknown gets a generic message. */
export function authErrorMessage(code: unknown): string | null {
  if (typeof code !== "string" || !code) return null;
  return code in AUTH_ERRORS ? AUTH_ERRORS[code as AuthErrorCode] : "Something went wrong. Please try again.";
}
