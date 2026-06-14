import type { ArchitectureOutput } from "@codebrief/shared";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { SourceList } from "./SourceList";

export function SystemNarrative({ narrative }: { narrative: ArchitectureOutput }) {
  return (
    <section id="system-narrative" className="space-y-4">
      <h2 className="font-mono text-xl font-semibold">System Narrative</h2>
      <div className="rounded border border-border bg-panel p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-blue">Purpose</h3>
          <ConfidenceBadge confidence={narrative.purpose.confidence} />
        </div>
        <p className="mt-2 leading-7 text-zinc-200">{narrative.purpose.claim}</p>
        <SourceList sources={narrative.purpose.sources} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {narrative.mainWorkflows.map((workflow) => (
          <div key={workflow.name} className="rounded border border-border bg-panel p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-text">{workflow.name}</h3>
              <ConfidenceBadge confidence={workflow.confidence} />
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">{workflow.claim}</p>
            <SourceList sources={workflow.sources} />
          </div>
        ))}
      </div>
      <div className="rounded border border-border bg-panel p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-text">Data Model</h3>
          <ConfidenceBadge confidence={narrative.dataModel.confidence} />
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">{narrative.dataModel.claim}</p>
        <SourceList sources={narrative.dataModel.sources} />
      </div>
    </section>
  );
}
