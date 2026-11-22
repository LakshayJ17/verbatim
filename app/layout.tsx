import type { Metadata, Viewport } from "next";
import { Geist, Zilla_Slab } from "next/font/google";
import "./globals.css";

// Geist for reading and interface text, Zilla Slab for headings.
const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const zillaSlab = Zilla_Slab({
  variable: "--font-display",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Set NEXT_PUBLIC_SITE_URL to the production origin before launch.
  metadataBase: (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
    } catch {
      return new URL("http://localhost:3000");
    }
  })(),
  applicationName: "Verbatim",
  title: {
    default: "Verbatim | Quotes checked against the transcript",
    template: "%s | Verbatim",
  },
  description:
    "Paste a YouTube link to a podcast, interview or lecture. Verbatim pulls out the key ideas and exact quotes, and checks each quote against the transcript.",
  keywords: [
    "podcast quotes",
    "YouTube transcript",
    "quote extraction",
    "interview notes",
    "lecture notes",
  ],
  // Note: metadata merges shallowly. Pages that set their own `alternates` or
  // `openGraph` replace these objects entirely, so they must set `url`/`canonical`
  // themselves (and `images: ["/opengraph-image"]` if they want the default card).
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Verbatim",
    locale: "en_IN",
    url: "/",
    title: "Verbatim | Quotes checked against the transcript",
    description:
      "Paste a YouTube link to a podcast, interview or lecture. Verbatim pulls out the key ideas and exact quotes, and checks each quote against the transcript.",
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f7f7",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${zillaSlab.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Gates entrance animations so content stays visible without JavaScript */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <a
          href="#main"
          className="sr-only z-[100] rounded-md bg-ink px-4 py-3 text-base font-medium text-paper focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
