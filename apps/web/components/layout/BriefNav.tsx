const sections = ["Overview", "System Narrative", "Decision Archaeology", "Landmine Map", "Assessment", "Q&A", "Diagram", "Export"];

export function BriefNav() {
  return (
    <nav className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
      <div className="flex gap-2 overflow-x-auto">
        {sections.map((section) => (
          <a
            key={section}
            href={`#${section.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            className="focus-ring whitespace-nowrap rounded border border-border bg-panel px-3 py-2 text-xs font-semibold text-muted transition-colors hover:text-text"
          >
            {section}
          </a>
        ))}
      </div>
    </nav>
  );
}

