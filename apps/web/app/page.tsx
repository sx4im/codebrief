import {
  AlertTriangle,
  ArrowRight,
  Cpu,
  FileCheck2,
  FileText,
  Gauge,
  GitBranch,
  Github,
  MessageSquare,
  Network,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { Aurora } from "@/components/layout/Aurora";
import { MotionProvider, Reveal } from "@/components/brief/StoryScroll";
import { demoBriefs, sampleBrief } from "@/lib/sample-data";

const severityTone: Record<string, string> = {
  critical: "text-severity-critical",
  high: "text-severity-high",
  medium: "text-severity-medium",
  low: "text-severity-low",
};

// Cards lift slightly on hover; reused across the feature grids.
const cardHover = "transition-all duration-300 hover:-translate-y-1 hover:border-ink/15 hover:shadow-soft";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen">
      <Aurora />
      <MarketingNav />

      <MotionProvider>
        {/* Hero */}
        <section className="mx-auto grid max-w-content gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_480px] lg:items-center lg:py-24">
          <Reveal>
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-medium text-charcoal backdrop-blur">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                AI technical due diligence for inherited codebases
              </span>
              <h1 className="font-campaign mt-6 max-w-[12ch] text-6xl text-ink sm:text-7xl lg:text-[88px]">
                Know what you inherited before you touch it.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-charcoal">
                Codebrief ingests GitHub history, PRs, docs, AST structure, dependencies, and risk signals to produce a
                sourced technical brief: narrative, decisions, landmines, and a rewrite assessment.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <ButtonLink href="/projects/new">
                  Analyze your first repo free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </ButtonLink>
                <ButtonLink href="/demo" variant="secondary">
                  View public demo
                </ButtonLink>
              </div>
              <a
                href="/demo"
                className="mt-7 inline-flex items-center gap-2 text-sm text-mute transition-colors hover:text-ink"
              >
                <ShieldCheck className="h-4 w-4 text-primary" />
                {demoBriefs.length} open-source repos analyzed, publicly viewable
              </a>
            </div>
          </Reveal>

          {/* Demo brief preview card */}
          <Reveal delay={0.15} y={40}>
            <div className="rounded-lg border border-border bg-card/90 p-6 shadow-soft backdrop-blur transition-shadow duration-300 hover:shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-mute">Demo brief</span>
                <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">complete</span>
              </div>
              <h2 className="mt-3 font-mono text-lg font-semibold text-ink">{sampleBrief.repoFullName}</h2>
              <div className="mt-5 space-y-3">
                {sampleBrief.topFindings.slice(0, 3).map((finding, i) => (
                  <Reveal key={finding.title} delay={0.25 + i * 0.1} y={16}>
                    <div className="rounded-md border border-border bg-bone/60 p-4">
                      <div className={`text-[11px] font-semibold uppercase tracking-wide ${severityTone[finding.severity] ?? "text-charcoal"}`}>
                        {finding.severity}
                      </div>
                      <div className="mt-1 font-semibold text-ink">{finding.title}</div>
                      <p className="mt-1.5 text-sm leading-6 text-charcoal">{finding.claim}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* What is Codebrief */}
        <section className="mx-auto max-w-content px-4 pb-4 sm:px-6">
          <Reveal>
            <div className="rounded-lg border border-border bg-card/90 p-8 backdrop-blur sm:p-10">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">What is Codebrief</span>
              <p className="font-display mt-4 max-w-4xl text-2xl font-semibold leading-snug tracking-tight text-ink sm:text-[28px]">
                Inheriting a codebase means the authors are gone and the context lives in scattered commits and closed PRs.
                Codebrief reconstructs that missing context automatically — and shows its work.
              </p>
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-charcoal">
                Point it at any repository and it reads the Git history, the pull requests, the docs, and the source itself,
                then writes a structured technical brief where <span className="font-semibold text-ink">every claim cites the
                evidence it came from</span>. No vague summaries — auditable findings you can act on.
              </p>
            </div>
          </Reveal>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-content px-4 py-16 sm:px-6">
          <Reveal>
            <div className="max-w-2xl">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">How it works</span>
              <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
                From repository to sourced brief in four steps
              </h2>
              <p className="mt-3 text-base leading-relaxed text-charcoal">
                No setup and no instrumentation. A sequential, multi-agent pipeline does the reading for you and streams its
                progress live.
              </p>
            </div>
          </Reveal>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Github, title: "Connect a repo", text: "Paste a GitHub URL or pick a repository from your connected account." },
              { icon: ScanSearch, title: "Ingest & analyze", text: "Codebrief reads commit history, PRs, and docs, then parses the source with tree-sitter and scores risk." },
              { icon: Cpu, title: "Multi-agent synthesis", text: "Specialized agents reconstruct the narrative, decisions, and risks, then weigh a build-on vs. rewrite verdict." },
              { icon: FileCheck2, title: "Get a sourced brief", text: "Every claim is validated against its citations. Read it on the web, export to PDF/Markdown, or ask follow-ups." },
            ].map((step, i) => (
              <Reveal key={step.title} delay={i * 0.1}>
                <div className={`relative h-full rounded-lg border border-border bg-card/90 p-6 backdrop-blur ${cardHover}`}>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-bone">
                      <step.icon className="h-5 w-5 text-ink" />
                    </span>
                    <span className="font-mono text-xs font-semibold tabular-nums text-stone">0{i + 1}</span>
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-ink">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-charcoal">{step.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* What's in a brief */}
        <section className="border-y border-border bg-bone/70 backdrop-blur">
          <div className="mx-auto max-w-content px-4 py-16 sm:px-6">
            <Reveal>
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">What&apos;s in a brief</span>
                <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
                  Everything you need to take over with confidence
                </h2>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-charcoal">
                  Each brief bundles seven evidence-backed sections — every claim cites the commit, PR, file, or metric it came from.
                </p>
              </div>
            </Reveal>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { icon: FileText, title: "System narrative", text: "A business-level explanation of what the system does, its data model, and its architecture pattern." },
                { icon: GitBranch, title: "Decision archaeology", text: "Why the code looks the way it does, reconstructed from commits, PRs, and discussion threads." },
                { icon: AlertTriangle, title: "Landmine map", text: "Risk-ranked files and coupling traps with severity, why they matter, and remediation estimates." },
                { icon: Gauge, title: "Rewrite assessment", text: "A grounded build-on vs. rewrite verdict — with reasons, risks, and an explicit uncertainty statement." },
                { icon: Network, title: "Architecture diagram", text: "An interactive dependency graph; select any module to inspect its coupling and landmines." },
                { icon: MessageSquare, title: "Grounded Q&A + exports", text: "Ask follow-up questions answered only from the evidence, then export to PDF or Markdown." },
              ].map((item, i) => (
                <Reveal key={item.title} delay={(i % 3) * 0.1}>
                  <div className={`h-full rounded-lg border border-border bg-card p-6 ${cardHover}`}>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-bone">
                      <item.icon className="h-5 w-5 text-ink" />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold text-ink">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-charcoal">{item.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Grounded guarantee strip */}
        <section className="mx-auto max-w-content px-4 py-16 sm:px-6">
          <Reveal>
            <div className="grid gap-8 rounded-lg border border-border bg-card/90 p-8 backdrop-blur sm:p-10 md:grid-cols-[1.2fr_1fr] md:items-center">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Grounded, not guessed</span>
                <h2 className="font-display mt-3 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                  If a claim can&apos;t be sourced, it doesn&apos;t ship as fact
                </h2>
                <p className="mt-4 text-base leading-relaxed text-charcoal">
                  After every agent step, outputs are validated against their citations. Invalid citations trigger a
                  correction retry; claim-like output that still can&apos;t be sourced is downgraded rather than presented as
                  truth. You can trust the brief because you can check it.
                </p>
              </div>
              <div className="space-y-3">
                {[
                  "Every finding links to a commit, PR, file, or metric",
                  "Confidence scores on each claim",
                  "Source-grounded Q&A over the analyzed repo",
                  "3 analyses free, then $50 once for lifetime access",
                ].map((point, i) => (
                  <Reveal key={point} delay={i * 0.08} y={16}>
                    <div className="flex items-start gap-3 rounded-md border border-border bg-bone/50 px-4 py-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-sm leading-6 text-charcoal">{point}</span>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* Closing CTA — dark band */}
        <section className="mx-auto max-w-content px-4 py-16 sm:px-6">
          <Reveal y={40}>
            <div className="rounded-lg bg-surface-dark px-8 py-14 text-center">
              <h2 className="font-display text-3xl font-bold tracking-tight text-on-dark sm:text-4xl">Start free, pay once</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-on-dark-mute">
                Run your first 3 repository analyses free. Unlock unlimited analyses forever with a one-time $50 payment —
                every feature included, no subscription.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <ButtonLink href="/projects/new">
                  Analyze a repo
                  <ArrowRight className="h-4 w-4" />
                </ButtonLink>
                <ButtonLink
                  href="/demo"
                  className="h-11 border border-white/25 bg-transparent px-6 text-on-dark hover:bg-white/10"
                >
                  Browse demo briefs
                </ButtonLink>
              </div>
            </div>
          </Reveal>
        </section>
      </MotionProvider>

      <Footer />
    </div>
  );
}
