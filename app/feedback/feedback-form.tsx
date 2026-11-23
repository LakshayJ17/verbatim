"use client";

import { useActionState } from "react";
import { sendFeedback, type FeedbackState } from "@/app/actions/feedback";

const initial: FeedbackState = { ok: false };

export function FeedbackForm({ page }: { page?: string }) {
  const [state, action, pending] = useActionState(sendFeedback, initial);

  if (state.ok) {
    return (
      <div role="status" className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">Thank you</h2>
        <p className="mt-2 text-base">Your feedback was sent. If you left an email, we may reply there.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5 rounded-xl border border-border bg-card p-6" noValidate>
      {page && <input type="hidden" name="page" value={page} />}
      {/* Honeypot, hidden from people and assistive tech */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label htmlFor="feedback-message" className="block text-base font-medium">
          What should we know?
        </label>
        <textarea
          id="feedback-message"
          name="message"
          required
          minLength={5}
          maxLength={2000}
          rows={6}
          autoComplete="off"
          aria-describedby={state.error ? "feedback-error" : undefined}
          placeholder="Something that confused you, a bug, an idea..."
          className="mt-2 w-full rounded-md border border-input bg-card px-3.5 py-2.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div>
        <label htmlFor="feedback-email" className="block text-base font-medium">
          Email <span className="font-normal text-muted-foreground">(optional, only if you want a reply)</span>
        </label>
        <input
          id="feedback-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          placeholder="you@example.com"
          className="mt-2 h-11 w-full rounded-md border border-input bg-card px-3.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {state.error && (
        <p id="feedback-error" role="alert" className="rounded-md bg-tag-red p-3 text-base text-tag-red-fg">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="press inline-flex h-11 items-center rounded-md bg-ink px-5 text-base font-medium text-white outline-none hover:bg-ink-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {pending ? "Sending..." : "Send feedback"}
      </button>
      <p className="text-sm text-muted-foreground">
        We store your message, the email if you give one, and your account id if you are signed in.
      </p>
    </form>
  );
}
