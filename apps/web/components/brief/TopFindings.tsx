import type { Finding } from "@codebrief/shared";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { SourceList } from "./SourceList";

export function TopFindings({ findings }: { findings: Finding[] }) {
  return (
    <section id="overview" className="space-y-4">
      <h2 className="font-mono text-xl font-semibold">Top Findings</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {findings.map((finding) => (
          <article key={finding.title} className="rounded border border-border bg-panel p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase text-muted">{finding.severity}</span>
              <ConfidenceBadge confidence={finding.confidence} />
            </div>
            <h3 className="mt-2 font-semibold">{finding.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{finding.claim}</p>
            <SourceList sources={finding.sources} />
          </article>
        ))}
      </div>
    </section>
  );
}
