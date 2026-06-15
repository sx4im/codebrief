import type { Finding } from "@codebrief/shared";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { SourceList } from "./SourceList";
import { severityTextClass } from "@/lib/severity";

export function TopFindings({ findings }: { findings: Finding[] }) {
  return (
    <section id="overview" className="space-y-5">
      <h2 className="font-display text-2xl font-bold tracking-tight text-ink">Top findings</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {findings.map((finding) => (
          <article key={finding.title} className="rounded-lg border border-border bg-card p-5 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[11px] font-semibold uppercase tracking-wide ${severityTextClass[finding.severity]}`}>{finding.severity}</span>
              <ConfidenceBadge confidence={finding.confidence} />
            </div>
            <h3 className="mt-2 font-semibold text-ink">{finding.title}</h3>
            <p className="mt-2 text-sm leading-6 text-charcoal">{finding.claim}</p>
            <SourceList sources={finding.sources} />
          </article>
        ))}
      </div>
    </section>
  );
}
