"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { QuickSignIn } from "@/components/quick-sign-in";

const initialState: FormState = {
  error: "",
  message: "",
};

type FormState = { error: string; message: string };

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(
    async (prevState: FormState, formData: FormData) => {
      const result = await signup(formData);
      if (result && "error" in result && result.error) {
        return { error: result.error, message: "" };
      }
      if (result && "message" in result && result.message) {
        return { error: "", message: result.message };
      }
      return { error: "", message: "" };
    },
    initialState
  );

  return (
    <div className="space-y-4">
      <QuickSignIn />

      <p className="text-base text-muted-foreground">Or use your email</p>

      <form action={formAction} className="space-y-3">
        {state.error && (
          <div role="alert" className="rounded-md bg-destructive/10 p-3 text-base text-destructive">
            {state.error}
          </div>
        )}
        {state.message && (
          <div role="status" className="rounded-md bg-mark p-3 text-base text-ink">
            {state.message}
          </div>
        )}
        
        <div className="space-y-1.5">
          <label
            htmlFor="name"
            className="text-base font-medium text-foreground"
          >
            Full name
          </label>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="Your name"
            autoComplete="name"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="text-base font-medium text-foreground"
          >
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label
              htmlFor="password"
              className="text-base font-medium text-foreground"
            >
              Password
            </label>
            <span id="password-hint" className="text-sm text-muted-foreground">
              At least 8 characters
            </span>
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            aria-describedby="password-hint"
          />
        </div>

        <div className="flex items-start gap-3">
          <input
            id="consent"
            name="consent"
            type="checkbox"
            required
            className="mt-1 size-5 shrink-0 accent-[var(--ink)]"
          />
          <label htmlFor="consent" className="text-base">
            I am 18 or older and agree to the{" "}
            <Link href="/terms" className="underline underline-offset-4">Terms</Link>
          </label>
        </div>

        <Button type="submit" className="mt-2 w-full" size="lg" disabled={isPending}>
          {isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
