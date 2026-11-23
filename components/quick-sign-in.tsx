"use client";

import { GoogleLogo, UserCircle } from "@phosphor-icons/react/dist/ssr";
import { continueAsGuest } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";

/**
 * Google and guest sign-in, side by side, for the sign-in and sign-up pages.
 * Phones show the short labels so both fit on one row.
 */
export function QuickSignIn() {
  const handleGoogle = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full gap-2 px-3 text-base"
        onClick={handleGoogle}
        aria-label="Continue with Google"
      >
        <GoogleLogo className="size-4" weight="bold" aria-hidden="true" />
        <span className="sm:hidden">Google</span>
        <span className="hidden sm:inline">Continue with Google</span>
      </Button>
      <form action={continueAsGuest}>
        <Button type="submit" variant="outline" className="h-11 w-full gap-2 px-3 text-base" aria-label="Continue as guest">
          <UserCircle className="size-4" aria-hidden="true" />
          <span className="sm:hidden">Guest</span>
          <span className="hidden sm:inline">Continue as guest</span>
        </Button>
      </form>
    </div>
  );
}
