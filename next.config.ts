import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const isDev = process.env.NODE_ENV === "development";

/**
 * Supabase project origin, derived from NEXT_PUBLIC_SUPABASE_URL at config
 * time. Falls back to any *.supabase.co project if the variable is missing or
 * malformed so the build never fails on it.
 */
function getSupabaseHost(): { protocol: "http" | "https"; hostname: string } {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return {
      protocol: url.protocol === "http:" ? "http" : "https",
      hostname: url.hostname,
    };
  } catch {
    return { protocol: "https", hostname: "*.supabase.co" };
  }
}

const supabase = getSupabaseHost();
const supabaseOrigin = `${supabase.protocol}://${supabase.hostname}`;
const supabaseWsOrigin = `${supabase.protocol === "http" ? "ws" : "wss"}://${supabase.hostname}`;

// Google account avatars (OAuth user_metadata.avatar_url) rendered via next/image.
const GOOGLE_AVATAR_HOST = "lh3.googleusercontent.com";

const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-inline' covers the Next.js inline bootstrap and the root layout's
  // inline `js` class script. React needs eval only in development.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin} https://${GOOGLE_AVATAR_HOST}`,
  "font-src 'self' data:",
  // data:/blob: are needed by the quote card export (html-to-image + fetch(dataUrl)).
  `connect-src 'self' data: blob: ${supabaseOrigin} ${supabaseWsOrigin}${isDev ? " ws: wss:" : ""}`,
  "media-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  `form-action 'self' ${supabaseOrigin} https://accounts.google.com`,
  "base-uri 'self'",
  "object-src 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    // Only hosts the app actually renders through next/image. A wildcard here
    // would turn /_next/image into an open image proxy.
    remotePatterns: [
      {
        protocol: supabase.protocol,
        hostname: supabase.hostname,
        pathname: "/storage/v1/object/public/**",
      },
      // Account avatars only (/a/… and the older /a-/…). Without a path limit
      // /_next/image would proxy any image anyone hosts on this Google domain.
      { protocol: "https", hostname: GOOGLE_AVATAR_HOST, pathname: "/a/**" },
      { protocol: "https", hostname: GOOGLE_AVATAR_HOST, pathname: "/a-/**" },
      // Video thumbnails on the analysis page. Served through /_next/image, so
      // the CSP needs no change and the viewer's browser never calls YouTube.
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/vi/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
