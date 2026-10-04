import type { MetadataRoute } from "next";

const BASE = "https://planimetrika.online";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/student", "/teacher", "/parent", "/admin", "/api", "/onboarding"] },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
