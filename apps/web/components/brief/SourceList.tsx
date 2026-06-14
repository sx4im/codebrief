import type { SourceCitation } from "@codebrief/shared";

export function SourceList({ sources }: { sources: SourceCitation[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {sources.map((source, index) => {
        const label = source.path || source.url || source.hash || source.section || source.excerpt || source.type;
        const href = safeSourceHref(source.url);
        const content = (
          <span className="rounded border border-border bg-background px-2 py-1 font-mono text-[11px] text-muted">
            {source.type}:{label}
          </span>
        );
        return href ? (
          <a key={`${source.type}-${index}`} href={href} target="_blank" rel="noreferrer" className="focus-ring rounded">
            {content}
          </a>
        ) : (
          <span key={`${source.type}-${index}`}>{content}</span>
        );
      })}
    </div>
  );
}

function safeSourceHref(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}
