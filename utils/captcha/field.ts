/**
 * Form field the Turnstile widget fills with its token. Cloudflare's widget
 * adds a hidden input with this name to the form it sits in.
 */
export const CAPTCHA_FIELD = "cf-turnstile-response";

/** Shown when a security check token is missing, expired or rejected. */
export const CAPTCHA_FAILED = "Please complete the security check and try again.";
