import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/components/seo/json-ld";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/library",
        "/bookmarks",
        "/collections",
        "/settings",
        "/create",
        "/auth",
        "/api",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
