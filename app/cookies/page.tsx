// Draft generated from the codebase; have a qualified lawyer review before launch.
import type { Metadata } from "next";
import { LegalPage, List, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Cookie policy",
  description: "The cookies and browser storage Verbatim uses, and how to clear them.",
  alternates: { canonical: "/cookies" },
  openGraph: { type: "website", siteName: "Verbatim", locale: "en_IN", url: "/cookies", images: ["/opengraph-image"] },
};

const items = [
  {
    name: "sb-<project>-auth-token (may be split into .0, .1 and so on)",
    kind: "Cookie, set by Verbatim through our sign-in provider Supabase",
    purpose:
      "Keeps you signed in, including as a guest. Holds your session tokens so each page knows who you are and can show your private data only to you.",
    type: "Strictly necessary",
    duration:
      "Up to 400 days, renewed while you use the site. Removed when you sign out or delete your account.",
  },
  {
    name: "sb-<project>-auth-token-code-verifier",
    kind: "Cookie, set by Verbatim through Supabase",
    purpose:
      "A one-time security code used while you sign in with Google, so the sign-in cannot be hijacked.",
    type: "Strictly necessary",
    duration: "Only needed during sign-in. Removed once sign-in completes.",
  },
  {
    name: "verbatim:pending-url",
    kind: "Local storage in your browser (not sent to our servers)",
    purpose:
      "Remembers a YouTube link you pasted on the home page so it is still there after you sign in or create an account.",
    type: "Strictly necessary (only set when you ask us to start with a link)",
    duration: "Removed as soon as the link is used on the new analysis page.",
  },
];

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie policy"
      intro={
        <p>
          Cookies are small files a website stores in your browser. Local storage is a similar feature that keeps
          data in your browser only. This page lists every cookie and storage item Verbatim uses.
        </p>
      }
    >
      <Section id="summary" title="The short version">
        <List>
          <li>We only use cookies and storage that are needed to sign you in and make the site work.</li>
          <li>We do not use analytics, advertising, social media or tracking cookies.</li>
          <li>We do not load third-party tracking scripts. Our fonts are served from our own site.</li>
          <li>Because everything we use is strictly necessary, we do not show a cookie consent banner.</li>
        </List>
      </Section>

      <Section id="list" title="What we use">
        {items.map((item) => (
          <div key={item.name} className="rounded-md border border-border p-5">
            <h3 className="text-lg font-semibold break-words">
              <code>{item.name}</code>
            </h3>
            <dl className="mt-3 space-y-2">
              <div>
                <dt className="font-semibold">What it is</dt>
                <dd>{item.kind}</dd>
              </div>
              <div>
                <dt className="font-semibold">Purpose</dt>
                <dd>{item.purpose}</dd>
              </div>
              <div>
                <dt className="font-semibold">Type</dt>
                <dd>{item.type}</dd>
              </div>
              <div>
                <dt className="font-semibold">How long it lasts</dt>
                <dd>{item.duration}</dd>
              </div>
            </dl>
          </div>
        ))}
        <p>
          <code>&lt;project&gt;</code> stands for the identifier of our Supabase project. The session cookies are
          limited to our site, are only sent to it, and use the SameSite=Lax setting, which stops other sites from
          sending them with most cross-site requests.
        </p>
      </Section>

      <Section id="google" title="Signing in with Google">
        <p>
          If you choose to sign in with Google, you are sent to a Google page for a moment. Google may set its own
          cookies there under its own policies. Verbatim does not control or read those cookies.
        </p>
      </Section>

      <Section id="clear" title="How to clear them">
        <List>
          <li>Signing out removes the sign-in cookies.</li>
          <li>
            You can delete cookies and site data for Verbatim at any time in your browser settings, usually under
            Privacy or Site settings. In most browsers you can also clear data for just this site from the padlock icon
            in the address bar.
          </li>
          <li>
            If you block these cookies, you will not be able to sign in, because Verbatim needs them to know who you
            are.
          </li>
        </List>
      </Section>

      <Section id="changes" title="Changes">
        <p>
          If we ever add a cookie that is not strictly necessary, such as analytics, we will update this page and ask
          for your consent before setting it.
        </p>
        <p>
          Questions: [CONTACT EMAIL].
        </p>
      </Section>
    </LegalPage>
  );
}
