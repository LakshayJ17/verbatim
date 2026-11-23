import Link from "next/link";

const links = [
  { href: "/discover", label: "Commonplace" },
  { href: "/login", label: "Sign in" },
  { href: "/signup", label: "Create account" },
  { href: "/feedback", label: "Feedback" },
  { href: "/terms", label: "Terms" },
  { href: "/cookies", label: "Cookies" },
] as const;

/** A single quiet line: what this is, the main and legal links, the year. */
export function Footer() {
  return (
    <footer className="grid w-full gap-2 px-5 py-8 text-[15px] leading-6 text-muted-foreground md:grid-cols-[1fr_auto_1fr] md:items-baseline md:gap-6 md:px-[8%]">
      <p>Verbatim. Quotes from long conversations.</p>
      <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="text-foreground underline-offset-4 hover:underline">
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="md:justify-self-end">&copy; {new Date().getFullYear()} Verbatim</p>
    </footer>
  );
}
