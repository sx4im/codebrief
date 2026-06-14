import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/demo"],
        disallow: ["/api", "/dashboard", "/projects", "/settings"],
      },
    ],
    sitemap: new URL("/sitemap.xml", baseUrl).toString(),
  };
}

function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      return "http://localhost:3000";
    }
  }
  return "http://localhost:3000";
}
