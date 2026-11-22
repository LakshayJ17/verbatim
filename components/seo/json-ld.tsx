/**
 * JSON-LD structured data helpers (server components, no client JS).
 *
 * Usage (in any server page or layout):
 *
 *   import { JsonLd, websiteJsonLd, softwareApplicationJsonLd,
 *            organizationJsonLd, breadcrumbJsonLd } from "@/components/seo/json-ld";
 *
 *   // Landing page: site + app + organization in one graph
 *   <JsonLd data={[websiteJsonLd(), softwareApplicationJsonLd(), organizationJsonLd()]} />
 *
 *   // Any nested page: breadcrumbs (paths may be relative; they are made absolute)
 *   <JsonLd data={breadcrumbJsonLd([
 *     { name: "Home", url: "/" },
 *     { name: "Discover", url: "/discover" },
 *   ])} />
 *
 * `JsonLd` serialises with `<` escaped as < (per the Next.js JSON-LD guide)
 * so user-supplied strings cannot close the script tag.
 *
 * Deliberately omitted: aggregateRating, review and offers/price. None of that
 * exists in the product, and fabricated values violate Google's structured data
 * policies. There is no logo file in /public yet, so Organization has no logo.
 *
 * The absolute base URL comes from NEXT_PUBLIC_SITE_URL (fallback
 * http://localhost:3000); set it to the production origin before launch.
 */

type JsonLdObject = Record<string, unknown>;

const SITE_NAME = "Verbatim";
const SITE_DESCRIPTION =
  "Paste a YouTube link to a podcast, interview or lecture. Verbatim pulls out the key ideas and exact quotes, and checks each quote against the transcript.";

/** Absolute site origin without a trailing slash. */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}

/** Resolves a relative path (or absolute URL) against the site origin. */
export function absoluteUrl(pathOrUrl: string): string {
  return new URL(pathOrUrl, `${getSiteUrl()}/`).toString();
}

export function websiteJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    description: SITE_DESCRIPTION,
    inLanguage: "en-IN",
  };
}

export function softwareApplicationJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web",
    description: SITE_DESCRIPTION,
    url: absoluteUrl("/"),
  };
}

export function organizationJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: absoluteUrl("/"),
  };
}

export type BreadcrumbItem = { name: string; url: string };

export function breadcrumbJsonLd(items: BreadcrumbItem[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

/** Serialises JSON for embedding in a script tag, escaping `<`. */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
