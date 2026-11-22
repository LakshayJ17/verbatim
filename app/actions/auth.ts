"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { z } from "zod";
import { ensureProfile } from "@/utils/auth/profile";

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
  const origin = (await headers()).get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

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

  // With email confirmation on, Supabase returns a user with no identities
  // (and no error) when the email is already registered.
  if (signUpData.user && signUpData.user.identities?.length === 0) {
    return { error: "An account with this email already exists. Sign in instead." };
  }

  // Email confirmation is on: the account exists but is not signed in yet.
  // The profile is created in /auth/callback after the link is clicked.
  if (!signUpData.session) {
    return {
      message: `We sent a confirmation link to ${email}. Open it to finish creating your account, then you will be signed in.`,
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
  const origin = (await headers()).get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
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

export async function signInWithGoogle() {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  if (data.url) {
    redirect(data.url);
  }
}

export async function continueAsGuest() {
  const supabase = await createClient();
  await clearExistingSession(supabase);
  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    let errorMessage = error.message;
    if (errorMessage.includes("Anonymous sign-ins are disabled")) {
      errorMessage = "Guest access is currently unavailable. Please sign in with Google or create an account.";
    }
    redirect(`/login?error=${encodeURIComponent(errorMessage)}`);
  }

  if (data?.user) {
    await ensureProfile(data.user);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
