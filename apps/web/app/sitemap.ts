import type { MetadataRoute } from "next";
import { demoBriefs } from "@/lib/sample-data";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getAppUrl();
  const publicRoutes: MetadataRoute.Sitemap = [
    {
      url: new URL("/", baseUrl).toString(),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: new URL("/demo", baseUrl).toString(),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  return [
    ...publicRoutes,
    ...demoBriefs.map((brief) => ({
      url: new URL(`/demo/${brief.slug}`, baseUrl).toString(),
      lastModified: new Date(brief.createdAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
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
