"use client";

import { useEffect, useRef, useState } from "react";
import { CAPTCHA_FIELD } from "@/utils/captcha/field";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not load")));
    script.onerror = () => {
      loading = null;
      reject(new Error("Turnstile did not load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Cloudflare Turnstile security check for a public form. Renders nothing
 * until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. Most visitors never see it:
 * it only shows a challenge when Cloudflare is unsure. It must sit inside
 * the <form>, where it adds the hidden token field. Each token works once,
 * so pass a `resetKey` that changes after every submission to get a new one.
 * `shownClassName` (spacing) applies only while a challenge is on screen, so
 * the hidden widget adds no height to the page.
 */
export function Captcha({ resetKey, shownClassName = "mb-2" }: { resetKey?: string | number; shownClassName?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return;
        widget.current = turnstile.render(container.current, {
          sitekey: SITE_KEY,
          appearance: "interaction-only",
          size: "flexible",
          theme: "light",
          "response-field-name": CAPTCHA_FIELD,
          "before-interactive-callback": () => setShown(true),
          "after-interactive-callback": () => setShown(false),
        });
      })
      .catch(() => {
        // Script blocked or offline: the server reports the missing check.
      });
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (widget.current) window.turnstile?.reset(widget.current);
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return <div ref={container} className={shown ? shownClassName : undefined} />;
}

/** The current token in a form, for actions called without FormData. */
export function readCaptchaToken(form: HTMLFormElement | null): string | undefined {
  const value = form?.querySelector<HTMLInputElement>(`input[name="${CAPTCHA_FIELD}"]`)?.value;
  return value || undefined;
}
