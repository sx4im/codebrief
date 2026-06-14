import type { Decision } from "@codebrief/shared";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { SourceList } from "./SourceList";

export function DecisionArchaeology({ decisions }: { decisions: Decision[] }) {
  return (
    <section id="decision-archaeology" className="space-y-4">
      <h2 className="font-mono text-xl font-semibold">Decision Archaeology</h2>
      <div className="space-y-3">
        {decisions.map((decision, index) => (
          <article key={decision.title} className="rounded border border-border bg-panel p-5">
            <div className="font-mono text-xs text-muted">decision {index + 1}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">{decision.title}</h3>
              <ConfidenceBadge confidence={decision.confidence} />
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{decision.description}</p>
            <p className="mt-3 text-sm leading-6 text-muted">{decision.assessment}</p>
            <SourceList sources={decision.evidence} />
          </article>
        ))}
      </div>
    </section>
  );
}
