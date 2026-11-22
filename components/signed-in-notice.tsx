import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { logout } from "@/app/actions/auth";

/**
 * Shown on the sign-in and sign-up pages when this browser already has a
 * session, so switching accounts is never a surprise.
 */
export async function SignedInNotice() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const who = user.is_anonymous ? "a guest" : user.email ?? "another account";

  return (
    <div role="status" className="mb-6 rounded-md bg-mark p-4 text-base text-ink">
      <p>
        You are signed in as <span className="font-semibold">{who}</span>. Signing in below will switch to the other
        account.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Link href="/dashboard" className="font-medium underline underline-offset-4">
          Go to dashboard
        </Link>
        <form action={logout}>
          <button type="submit" className="font-medium underline underline-offset-4">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
