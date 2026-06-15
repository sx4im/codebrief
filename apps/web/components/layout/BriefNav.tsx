const sections = ["Overview", "System Narrative", "Decision Archaeology", "Landmine Map", "Assessment", "Q&A", "Diagram", "Export"];

export function BriefNav() {
  return (
    <nav className="sticky top-0 z-10 border-b border-border bg-canvas/90 px-4 py-3 backdrop-blur">
      <div className="flex gap-2 overflow-x-auto">
        {sections.map((section) => (
          <a
            key={section}
            href={`#${section.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            className="focus-ring whitespace-nowrap rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-charcoal transition-colors hover:border-ink/30 hover:text-ink"
          >
            {section}
          </a>
        ))}
      </div>
    </nav>
  );
}

