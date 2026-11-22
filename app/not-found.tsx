import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-24 outline-none">
      <Link href="/" className="text-2xl font-bold tracking-[-0.03em]">
        Verbatim
      </Link>
      <h1 className="heading-display mt-10 text-4xl sm:text-5xl">This page is not in the transcript</h1>
      <p className="mt-4 max-w-[52ch] text-lg">
        The link may be old, or the page may have been removed. Published posts disappear when their author
        unpublishes them.
      </p>
      <ul className="mt-8 flex flex-wrap gap-3">
        <li>
          <Link
            href="/"
            className="press inline-flex h-11 items-center rounded-md bg-ink px-4 text-base font-medium text-white outline-none hover:bg-ink-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Go to the home page
          </Link>
        </li>
        <li>
          <Link
            href="/discover"
            className="inline-flex h-11 items-center rounded-md border border-input/50 bg-card px-4 text-base outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring"
          >
            Browse Commonplace
          </Link>
        </li>
        <li>
          <Link
            href="/library"
            className="inline-flex h-11 items-center rounded-md border border-input/50 bg-card px-4 text-base outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open your library
          </Link>
        </li>
      </ul>
    </main>
  );
}
