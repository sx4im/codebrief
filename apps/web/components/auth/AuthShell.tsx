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
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-panel/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <ButtonLink href="/" variant="ghost" className="px-0 font-mono text-lg font-semibold">
            Codebrief
          </ButtonLink>
          <div className="flex gap-2">
            <ButtonLink href="/demo" variant="secondary">Demo</ButtonLink>
            <ButtonLink href="/dashboard" variant="secondary">Dashboard</ButtonLink>
          </div>
        </div>
      </header>
      <section className="mx-auto grid min-h-[calc(100vh-73px)] max-w-7xl gap-10 px-4 py-10 lg:grid-cols-[1fr_430px] lg:items-center lg:py-16">
        <div className="max-w-3xl">
          <div className="inline-flex rounded border border-border bg-panel px-3 py-2 font-mono text-xs uppercase text-muted">
            authenticated analysis workspace
          </div>
          <h1 className="mt-6 font-mono text-4xl font-semibold leading-tight md:text-5xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted">{subtitle}</p>
          <div className="mt-8 grid gap-3">
            {checks.map((item) => (
              <div key={item.label} className="border border-border bg-panel p-4">
                <div className="flex items-start gap-3">
                  <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-blue" />
                  <div>
                    <div className="font-semibold">{item.label}</div>
                    <p className="mt-1 text-sm leading-6 text-muted">{item.text}</p>
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

export const clerkAuthAppearance = {
  variables: {
    colorBackground: "#141414",
    colorInputBackground: "#0d0d0d",
    colorInputText: "#f4f4f5",
    colorPrimary: "#3b82f6",
    colorText: "#f4f4f5",
    colorTextSecondary: "#a1a1aa",
    borderRadius: "4px",
    fontFamily: "var(--font-geist)",
    fontFamilyButtons: "var(--font-geist)",
  },
  elements: {
    cardBox: "border border-[#2a2a2a] bg-[#141414] shadow-none",
    card: "bg-[#141414] shadow-none",
    headerTitle: "font-mono text-[#f4f4f5]",
    headerSubtitle: "text-[#a1a1aa]",
    socialButtonsBlockButton: "border-[#2a2a2a] bg-[#0d0d0d] text-[#f4f4f5] hover:bg-[#1b1b1b]",
    formButtonPrimary: "bg-[#3b82f6] text-white hover:bg-[#2563eb]",
    formFieldInput: "border-[#2a2a2a] bg-[#0d0d0d] text-[#f4f4f5]",
    footerActionText: "text-[#a1a1aa]",
    footerActionLink: "text-[#3b82f6]",
  },
};

export function ClerkConfigurationNotice() {
  return (
    <div className="border border-border bg-panel p-6">
      <div className="font-mono text-sm uppercase text-amber">Clerk keys required</div>
      <h2 className="mt-3 text-xl font-semibold">Authentication UI is ready but not configured.</h2>
      <p className="mt-3 text-sm leading-6 text-muted">
        Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to `.env` to enable sign in, GitHub OAuth, protected
        dashboard access, and usage-linked analyses.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <ButtonLink href="/demo" variant="secondary">View demos</ButtonLink>
      </div>
    </div>
  );
}
