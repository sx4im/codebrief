import { ArrowRight, FileSearch, ShieldCheck, TerminalSquare } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { demoBriefs, sampleBrief } from "@/lib/sample-data";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-panel/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="font-mono text-lg font-semibold">Codebrief</div>
          <div className="flex gap-2">
            <ButtonLink href="/demo" variant="secondary">Demo</ButtonLink>
            <ButtonLink href="/dashboard">Analyze repo</ButtonLink>
          </div>
        </div>
      </header>
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1fr_520px] lg:py-24">
        <div>
          <div className="inline-flex rounded border border-border bg-panel px-3 py-2 font-mono text-xs text-muted">
            AI technical due diligence for inherited codebases
          </div>
          <h1 className="mt-6 max-w-4xl font-mono text-4xl font-semibold leading-tight md:text-6xl">
            Know what you inherited before you touch it.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            Codebrief ingests GitHub history, PRs, docs, AST structure, dependencies, and risk signals to produce a sourced technical brief: narrative, decisions, landmines, and rewrite assessment.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/projects/new">
              Analyze your first repo free
              <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/demo" variant="secondary">View public demo</ButtonLink>
          </div>
          <a href="/demo" className="mt-6 inline-flex items-center gap-2 text-sm text-muted hover:text-text">
            <ShieldCheck className="h-4 w-4 text-blue" />
            {demoBriefs.length} open-source repos analyzed, publicly viewable
          </a>
        </div>
        <div className="rounded border border-border bg-panel p-5">
          <div className="font-mono text-xs uppercase text-muted">demo brief</div>
          <h2 className="mt-2 text-xl font-semibold">{sampleBrief.repoFullName}</h2>
          <div className="mt-5 space-y-3">
            {sampleBrief.topFindings.map((finding) => (
              <div key={finding.title} className="rounded border border-border bg-background p-4">
                <div className="text-xs uppercase text-amber">{finding.severity}</div>
                <div className="mt-1 font-semibold">{finding.title}</div>
                <p className="mt-2 text-sm leading-6 text-muted">{finding.claim}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="border-y border-border bg-panel">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-12 md:grid-cols-3">
          {[
            { icon: FileSearch, title: "Narrative", text: "Business-level system explanation with citations." },
            { icon: TerminalSquare, title: "Archaeology", text: "Architectural decisions reconstructed from history." },
            { icon: ShieldCheck, title: "Landmines", text: "Risk-ranked files and remediation plans." },
          ].map((item) => (
            <div key={item.title} className="rounded border border-border bg-background p-5">
              <item.icon className="h-5 w-5 text-blue" />
              <h3 className="mt-4 font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{item.text}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="rounded border border-border bg-panel p-8 text-center">
          <h2 className="font-mono text-2xl font-semibold">Free and open</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted">
            Every feature is free: unlimited analyses, public and private repositories, source-grounded Q&amp;A, and Markdown
            and PDF exports. No plans, no usage caps, no card required.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/projects/new">
              Analyze a repo
              <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/demo" variant="secondary">Browse demo briefs</ButtonLink>
          </div>
        </div>
      </section>
    </main>
  );
}

