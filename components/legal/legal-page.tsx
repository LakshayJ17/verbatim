// Shared building blocks for the privacy, terms and cookie pages.
// Plain server components: no client JavaScript, no animation.
import Link from "next/link";
import type { ReactNode } from "react";

export const LAST_UPDATED = "17 October 2026";

export function LegalPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <main id="main" className="mx-auto max-w-3xl px-5 py-16">
      <p className="text-base leading-relaxed">
        <Link href="/" className="underline underline-offset-4">
          Verbatim
        </Link>
      </p>
      <h1 className="heading-display mt-6 text-4xl">{title}</h1>
      <p className="mt-4 text-base leading-relaxed">Last updated: {LAST_UPDATED}</p>
      {intro ? <div className="mt-6 space-y-4 text-base leading-relaxed">{intro}</div> : null}
      {children}
      <nav aria-label="Legal" className="mt-16 text-base leading-relaxed">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          <li>
            <Link href="/privacy" className="underline underline-offset-4">
              Privacy policy
            </Link>
          </li>
          <li>
            <Link href="/terms" className="underline underline-offset-4">
              Terms of service
            </Link>
          </li>
          <li>
            <Link href="/cookies" className="underline underline-offset-4">
              Cookie policy
            </Link>
          </li>
        </ul>
      </nav>
    </main>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mt-12 text-2xl font-semibold">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-base leading-relaxed">{children}</div>
    </section>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-6">{children}</ul>;
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="underline underline-offset-4" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function InternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="underline underline-offset-4">
      {children}
    </Link>
  );
}
