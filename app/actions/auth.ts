"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { z } from "zod";
import { ensureProfile } from "@/utils/auth/profile";
import { consumeNetworkLimit } from "@/utils/rate-limit";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(255, "Password is too long"),
});

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Drops whatever session this browser already holds before signing in as
 * someone else, so a previous account can never carry over. "local" only
 * clears this browser's cookies; the other account stays signed in elsewhere.
 */
/**
 * Where links in auth emails point. The configured site address wins, so the
 * link never depends on a request header; the Origin header is only a
 * fallback for local setups without NEXT_PUBLIC_SITE_URL.
 */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  return (await headers()).get("origin") || "http://localhost:3000";
}

async function clearExistingSession(supabase: SupabaseServerClient) {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // No session to clear.
  }
}

export async function login(formData: FormData) {
  const supabase = await createClient();

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const data = parsed.data;

  // Slows password guessing from one network; Supabase's own limit only sees
  // this server's address.
  if (!(await consumeNetworkLimit("login"))) {
    return { error: "Too many sign-in attempts. Please wait a few minutes and try again." };
  }

  await clearExistingSession(supabase);
  const { data: signedIn, error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    if (error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message)) {
      return {
        error: "Confirm your email before signing in. Open the link we sent you, or send a new one below.",
        needsConfirmation: true,
      };
    }
    return { error: error.message };
  }

  if (signedIn.user) await ensureProfile(signedIn.user);

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { email, password, name } = parsed.data;
  if (!(await consumeNetworkLimit("signup"))) {
    return { error: "Too many sign-ups from this network. Please try again later." };
  }
  const origin = await siteOrigin();

  await clearExistingSession(supabase);

  const { data: signUpData, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Email confirmation is on, so there is no session yet. Supabase also
  // answers this way (a user with no identities) when the email is already
  // registered; both cases get the same reply so the form can't be used to
  // find out which emails have accounts. The profile is created in
  // /auth/callback after the link is clicked.
  if (!signUpData.session) {
    return {
      message: `Check ${email} for a confirmation link to finish creating your account. Already have an account with this email? Sign in instead.`,
    };
  }

  if (signUpData?.user) {
    await ensureProfile(signUpData.user);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

const resendSchema = z.object({ email: z.string().email("Invalid email address") });

/**
 * Sends a fresh sign-up confirmation link. Always answers the same way so it
 * can't be used to find out which emails have accounts. Supabase applies its
 * own email rate limits on top.
 */
export async function resendConfirmation(email: string) {
  const parsed = resendSchema.safeParse({ email });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error && error.status === 429) {
    return { error: "Too many emails sent. Please wait a few minutes and try again." };
  }
  return { message: "If that account still needs confirming, a new link is on its way. Check your spam folder too." };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function continueAsGuest() {
  const supabase = await createClient();

  // Already a guest in this browser: keep that session rather than creating
  // another anonymous account on every click.
  const {
    data: { user: current },
  } = await supabase.auth.getUser();
  if (current?.is_anonymous) {
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }

  // Every guest is a real account, so cap how many one network can create.
  if (!(await consumeNetworkLimit("guest_create"))) {
    redirect("/login?error=guest_limit");
  }

  await clearExistingSession(supabase);
  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    console.error("[auth] guest sign-in failed:", error.message);
    redirect("/login?error=guest_unavailable");
  }

  if (data?.user) {
    await ensureProfile(data.user);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
