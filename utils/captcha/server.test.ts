import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { captchaTokenFrom, cleanCaptchaToken, isCaptchaError, verifyCaptcha } from "./server";
import { CAPTCHA_FIELD } from "./field";

describe("captcha tokens", () => {
  it("reads the widget's field from a form", () => {
    const form = new FormData();
    form.set(CAPTCHA_FIELD, "token-123");
    expect(captchaTokenFrom(form)).toBe("token-123");
    expect(captchaTokenFrom(new FormData())).toBeUndefined();
  });

  it("accepts only plausible token strings", () => {
    expect(cleanCaptchaToken("")).toBeUndefined();
    expect(cleanCaptchaToken(42)).toBeUndefined();
    expect(cleanCaptchaToken("x".repeat(5000))).toBeUndefined();
    expect(cleanCaptchaToken("abc")).toBe("abc");
  });

  it("recognises Supabase's CAPTCHA refusal", () => {
    expect(isCaptchaError({ code: "captcha_failed", message: "" })).toBe(true);
    expect(isCaptchaError({ message: "captcha protection: request disallowed (no-captcha-token)" })).toBe(true);
    expect(isCaptchaError({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe(false);
  });
});

describe("verifyCaptcha", () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("passes everything while CAPTCHA is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyCaptcha(undefined)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("when configured", () => {
    beforeEach(() => {
      vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
      vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    });

    it("refuses a missing token without calling Cloudflare", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      expect(await verifyCaptcha(undefined)).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends the secret and token, and follows Cloudflare's answer", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));
      vi.stubGlobal("fetch", fetchMock);
      expect(await verifyCaptcha("tok")).toBe(true);
      const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
      expect(body.get("secret")).toBe("secret");
      expect(body.get("response")).toBe("tok");

      fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] })));
      expect(await verifyCaptcha("bad")).toBe(false);
    });

    it("fails closed when Cloudflare errors or can't be reached", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 500 })));
      expect(await verifyCaptcha("tok")).toBe(false);
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
      expect(await verifyCaptcha("tok")).toBe(false);
    });
  });
});
