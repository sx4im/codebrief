import type { RewriteAssessment as Assessment } from "@codebrief/shared";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { SourceList } from "./SourceList";

export function RewriteAssessment({ assessment }: { assessment: Assessment }) {
  return (
    <section id="assessment" className="space-y-4">
      <h2 className="font-display text-2xl font-bold tracking-tight text-ink">Rewrite assessment</h2>
      <div className="rounded-lg border border-border bg-card p-5 shadow-card">
        <div className="font-mono text-xs uppercase text-mute">verdict</div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="font-display text-2xl font-bold capitalize text-ink">{assessment.verdict}</div>
          <ConfidenceBadge confidence={assessment.confidence} />
        </div>
        <p className="mt-3 text-sm leading-6 text-charcoal">{assessment.uncertainty}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {assessment.reasons.map((reason) => (
          <div key={reason.claim} className="space-y-2 rounded-lg border border-border bg-card p-4 shadow-card">
            <ConfidenceBadge confidence={reason.confidence} />
            <p className="text-sm leading-6 text-body">{reason.claim}</p>
            <SourceList sources={reason.sources} />
          </div>
        ))}
      </div>
    </section>
  );
}
