import { FileSearch, GitBranch, ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";

const checks = [
  { icon: GitBranch, label: "GitHub-first ingestion", text: "Repository history, PRs, docs, dependencies, and AST signals stay tied to source evidence." },
  { icon: ShieldCheck, label: "Source-validated agents", text: "Every claim is checked before it can enter a brief; unsupported claims are downgraded and flagged." },
  { icon: FileSearch, label: "Client-ready output", text: "Narrative, decisions, landmines, rewrite verdict, diagram, Q&A, Markdown, and PDF exports." },
];

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-canvas">
      <header className="border-b border-border bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-[60px] max-w-content items-center justify-between px-4 sm:px-6">
          <ButtonLink href="/" variant="ghost" className="font-display px-0 text-xl font-bold tracking-tightest text-ink">
            Codebrief
          </ButtonLink>
          <div className="flex gap-2">
            <ButtonLink href="/demo" variant="secondary">Demo</ButtonLink>
            <ButtonLink href="/dashboard" variant="secondary">Dashboard</ButtonLink>
          </div>
        </div>
      </header>
      <section className="mx-auto grid min-h-[calc(100vh-61px)] max-w-content gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_430px] lg:items-center lg:py-16">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-charcoal">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Authenticated analysis workspace
          </span>
          <h1 className="font-display mt-6 text-4xl font-bold leading-[1.05] tracking-tight text-ink md:text-5xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-charcoal">{subtitle}</p>
          <div className="mt-8 grid gap-3">
            {checks.map((item) => (
              <div key={item.label} className="rounded-lg border border-border bg-card p-4 shadow-card">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bone">
                    <item.icon className="h-4 w-4 text-ink" />
                  </span>
                  <div>
                    <div className="font-semibold text-ink">{item.label}</div>
                    <p className="mt-1 text-sm leading-6 text-charcoal">{item.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="w-full justify-self-center lg:justify-self-end">{children}</div>
      </section>
    </main>
  );
}

// Clerk's hosted components are themed to the cream/orange system (DESIGN.md).
export const clerkAuthAppearance = {
  variables: {
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#202020",
    colorPrimary: "#ea2804",
    colorText: "#202020",
    colorTextSecondary: "#646464",
    borderRadius: "10px",
    fontFamily: "var(--font-sans)",
    fontFamilyButtons: "var(--font-sans)",
  },
  elements: {
    cardBox: "border border-[rgba(32,32,32,0.12)] bg-white shadow-soft",
    card: "bg-white shadow-none",
    headerTitle: "font-display text-[#202020]",
    headerSubtitle: "text-[#646464]",
    socialButtonsBlockButton: "rounded-full border-[rgba(32,32,32,0.2)] bg-white text-[#202020] hover:bg-[#f3f0e8]",
    formButtonPrimary: "rounded-full bg-[#ea2804] text-white hover:bg-[#c01f00]",
    formFieldInput: "rounded-full border-[rgba(32,32,32,0.2)] bg-white text-[#202020]",
    footerActionText: "text-[#646464]",
    footerActionLink: "text-[#ea2804]",
  },
};

export function ClerkConfigurationNotice() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <div className="font-mono text-sm uppercase text-severity-medium">Clerk keys required</div>
      <h2 className="mt-3 text-xl font-semibold text-ink">Authentication UI is ready but not configured.</h2>
      <p className="mt-3 text-sm leading-6 text-charcoal">
        Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to `.env` to enable sign in, GitHub OAuth, protected
        dashboard access, and usage-linked analyses.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <ButtonLink href="/demo" variant="secondary">View demos</ButtonLink>
      </div>
    </div>
  );
}
