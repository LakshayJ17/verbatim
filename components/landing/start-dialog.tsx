"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LinkSimple } from "@phosphor-icons/react/dist/ssr";

/** Read by app/(app)/dashboard/new to prefill the link after sign-up. */
export const PENDING_URL_KEY = "verbatim:pending-url";

/**
 * The closing step of the landing page: the same link field the app starts
 * with. The link is kept in localStorage and prefilled after sign-up.
 */
export function StartDialog() {
  const id = useId();
  const router = useRouter();
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      try {
        localStorage.setItem(PENDING_URL_KEY, url.trim());
      } catch {
        // Storage can be unavailable (private mode). Sign-up still works.
      }
    }
    router.push("/signup");
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <label htmlFor={`${id}-url`} className="sr-only">
        YouTube link
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-0">
        <div className="relative flex-1">
          <LinkSimple
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id={`${id}-url`}
            name="url"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a YouTube link..."
            className="h-14 w-full rounded-[var(--radius)] border border-input bg-card pl-12 pr-4 text-[17px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring sm:rounded-r-none sm:border-r-0"
          />
        </div>
        <button
          type="submit"
          className="press inline-flex h-14 items-center justify-center gap-2 rounded-[var(--radius)] bg-ink px-6 text-[17px] font-medium text-paper outline-none hover:bg-ink-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:rounded-l-none"
        >
          Make quote images
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
