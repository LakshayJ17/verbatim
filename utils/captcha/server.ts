import "server-only";
import { CAPTCHA_FIELD } from "./field";

/**
 * CAPTCHA on public forms (Cloudflare Turnstile). Off until
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
 *
 * Sign-up, password sign-in, guest sign-in and the confirmation email are
 * checked by Supabase Auth itself once CAPTCHA protection is turned on in the
 * Supabase dashboard: the app only passes the token along. The feedback form
 * is checked here with TURNSTILE_SECRET_KEY.
 */
export function captchaEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

/** The widget's token from a submitted form, if any. */
export function captchaTokenFrom(formData: FormData): string | undefined {
  return cleanCaptchaToken(formData.get(CAPTCHA_FIELD));
}

/** Accepts only a plausible token string (Turnstile tokens are under 2 KB). */
export function cleanCaptchaToken(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 4096 ? value : undefined;
}

/** True when Supabase Auth refused the request because of its CAPTCHA check. */
export function isCaptchaError(error: { code?: string; message?: string }): boolean {
  return error.code === "captcha_failed" || /captcha/i.test(error.message ?? "");
}

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Checks a token with Cloudflare, for forms Supabase Auth does not see.
 * Passes everything while CAPTCHA is not configured. Once it is, a missing
 * token, a rejected one, or no answer from Cloudflare within 5 s fails.
 */
export async function verifyCaptcha(token: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!captchaEnabled() || !secret) return true;
  if (!token) return false;
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.error("[captcha] verify failed:", res.status);
      return false;
    }
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (e) {
    console.error("[captcha] verify failed:", e instanceof Error ? e.message : e);
    return false;
  }
}
