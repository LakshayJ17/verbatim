"use client";

import { useActionState, useState, useTransition } from "react";
import { login, continueAsGuest, resendConfirmation } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { UserCircle } from "@phosphor-icons/react/dist/ssr";

const initialState: FormState = {
  error: "",
  needsConfirmation: false,
  email: "",
};

type FormState = { error: string; needsConfirmation: boolean; email: string };

import { createClient } from "@/utils/supabase/client";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    async (prevState: FormState, formData: FormData) => {
      const result = await login(formData);
      const email = String(formData.get("email") ?? "");
      if (result?.error) {
        return { error: result.error, needsConfirmation: "needsConfirmation" in result && !!result.needsConfirmation, email };
      }
      return { error: "", needsConfirmation: false, email };
    },
    initialState
  );

  const [resendNote, setResendNote] = useState("");
  const [resending, startResend] = useTransition();
  const handleResend = () =>
    startResend(async () => {
      const res = await resendConfirmation(state.email);
      setResendNote(("message" in res && res.message) || ("error" in res && res.error) || "");
    });

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <Button variant="outline" className="w-full gap-2" size="lg" onClick={handleGoogleLogin} type="button">
          Continue with Google
        </Button>
        <form action={continueAsGuest}>
          <Button type="submit" variant="outline" className="w-full gap-2" size="lg">
            <UserCircle className="size-4" />
            Continue as guest
          </Button>
        </form>
      </div>

      <p className="text-base text-muted-foreground">Or use your email</p>

      <form action={formAction} className="space-y-4">
        {state.error && (
          <div role="alert" className="rounded-md bg-destructive/10 p-3 text-base text-destructive">
            <p>{state.error}</p>
            {state.needsConfirmation && (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="mt-2 font-medium underline underline-offset-4 disabled:opacity-60"
              >
                {resending ? "Sending…" : "Resend confirmation email"}
              </button>
            )}
          </div>
        )}
        {resendNote && (
          <p role="status" className="rounded-md bg-mark p-3 text-base text-ink">
            {resendNote}
          </p>
        )}
        
        <div className="space-y-2">
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="text-base font-medium text-foreground"
            >
              Password
            </label>
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={isPending}>
          {isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
