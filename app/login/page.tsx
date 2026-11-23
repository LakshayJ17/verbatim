import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { AuthShowcase } from "@/components/auth-showcase";
import { SignedInNotice } from "@/components/signed-in-notice";
import { authErrorMessage } from "@/utils/auth/errors";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Verbatim account.",
  robots: { index: false, follow: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await searchParams;
  // Only fixed messages are shown; see utils/auth/errors.ts.
  const error = authErrorMessage(resolvedParams.error);

  return (
    <main id="main" tabIndex={-1} className="grid min-h-dvh outline-none lg:grid-cols-2">
      <AuthShowcase />
      <div className="flex flex-col items-center justify-center px-4 py-6">
      <div className="w-full max-w-md">
        {error && (
          <div role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-base text-destructive">
            {error}
          </div>
        )}
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-1.5 text-base text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to home
        </Link>
        <SignedInNotice />
        <div className="mb-5">
          <Link href="/" className="text-2xl font-bold tracking-[-0.03em] lg:hidden">
            Verbatim
          </Link>
          <h1 className="heading-display mt-4 text-3xl sm:text-4xl lg:mt-0">Sign in</h1>
          <p className="mt-2 text-base sm:text-lg">Sign in to get back to your library.</p>
        </div>

        <LoginForm />

        <p className="mt-5 text-base text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Create one
          </Link>
        </p>
      </div>
      </div>
    </main>
  );
}
