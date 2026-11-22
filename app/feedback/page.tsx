import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = {
  title: "Send feedback",
  description: "Tell the Verbatim team what is working, what is not, and what you would like to see.",
  alternates: { canonical: "/feedback" },
};

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const page = typeof from === "string" && from.startsWith("/") ? from.slice(0, 200) : undefined;

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 px-5 py-14 outline-none">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Feedback" }]} />
      <h1 className="heading-display mt-6 text-4xl">Send feedback</h1>
      <p className="mt-3 max-w-[52ch] text-lg">
        Found a bug, a quote labelled wrongly, or something confusing? Tell us. Every message is read.
      </p>
      <div className="mt-8">
        <FeedbackForm page={page} />
      </div>
      <p className="mt-8 text-base text-muted-foreground">
        Looking for something else? <Link href="/discover" className="underline underline-offset-4">Browse Discover</Link>{" "}
        or <Link href="/" className="underline underline-offset-4">go to the home page</Link>.
      </p>
    </main>
  );
}
