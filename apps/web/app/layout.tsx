import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Bricolage_Grotesque, Geist, JetBrains_Mono } from "next/font/google";
import { isClerkConfigured } from "@/lib/auth/config";
import "./globals.css";

// Three-family stack per DESIGN.md: Bricolage Grotesque (display, sub for
// rb-freigeist-neue), Geist (UI/body, sub for basier-square), JetBrains Mono (code).
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
});

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: {
    default: "Codebrief | AI technical due diligence for inherited codebases",
    template: "%s | Codebrief",
  },
  description:
    "Codebrief analyzes GitHub history, architecture, dependencies, and risk signals to produce sourced technical briefs for inherited codebases.",
  applicationName: "Codebrief",
  keywords: [
    "technical due diligence",
    "codebase analysis",
    "software architecture audit",
    "GitHub analysis",
    "rewrite assessment",
  ],
  creator: "Codebrief",
  publisher: "Codebrief",
  openGraph: {
    title: "Codebrief",
    description: "AI technical due diligence for inherited codebases.",
    url: "/",
    siteName: "Codebrief",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Codebrief",
    description: "AI technical due diligence for inherited codebases.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );

  if (!isClerkConfigured()) return body;

  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      {body}
    </ClerkProvider>
  );
}
