import type { ArchitectureOutput } from "@codebrief/shared";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { SourceList } from "./SourceList";

export function SystemNarrative({ narrative }: { narrative: ArchitectureOutput }) {
  return (
    <section id="system-narrative" className="space-y-4">
      <h2 className="font-display text-2xl font-bold tracking-tight text-ink">System narrative</h2>
      <div className="rounded-lg border border-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">Purpose</h3>
          <ConfidenceBadge confidence={narrative.purpose.confidence} />
        </div>
        <p className="mt-2 leading-7 text-body">{narrative.purpose.claim}</p>
        <SourceList sources={narrative.purpose.sources} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {narrative.mainWorkflows.map((workflow) => (
          <div key={workflow.name} className="rounded-lg border border-border bg-card p-5 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">{workflow.name}</h3>
              <ConfidenceBadge confidence={workflow.confidence} />
            </div>
            <p className="mt-2 text-sm leading-6 text-charcoal">{workflow.claim}</p>
            <SourceList sources={workflow.sources} />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">Data Model</h3>
          <ConfidenceBadge confidence={narrative.dataModel.confidence} />
        </div>
        <p className="mt-2 text-sm leading-6 text-charcoal">{narrative.dataModel.claim}</p>
        <SourceList sources={narrative.dataModel.sources} />
      </div>
    </section>
  );
}
