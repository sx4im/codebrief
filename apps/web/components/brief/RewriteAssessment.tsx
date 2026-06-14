import type { RewriteAssessment as Assessment } from "@codebrief/shared";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { SourceList } from "./SourceList";

export function RewriteAssessment({ assessment }: { assessment: Assessment }) {
  return (
    <section id="assessment" className="space-y-4">
      <h2 className="font-mono text-xl font-semibold">Rewrite Assessment</h2>
      <div className="rounded border border-border bg-panel p-5">
        <div className="font-mono text-xs uppercase text-muted">verdict</div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="text-2xl font-semibold">{assessment.verdict}</div>
          <ConfidenceBadge confidence={assessment.confidence} />
        </div>
        <p className="mt-3 text-sm text-muted">{assessment.uncertainty}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {assessment.reasons.map((reason) => (
          <div key={reason.claim} className="rounded border border-border bg-panel p-4">
            <ConfidenceBadge confidence={reason.confidence} />
            <p className="text-sm leading-6 text-zinc-300">{reason.claim}</p>
            <SourceList sources={reason.sources} />
          </div>
        ))}
      </div>
    </section>
  );
}
