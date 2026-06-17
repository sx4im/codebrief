"use client";

import { Fragment, useMemo, useState } from "react";
import { ArrowUpDown, ChevronDown, ChevronUp, Download } from "lucide-react";
import type { Landmine, LandmineCategory, Severity, SourceCitation } from "@codebrief/shared";
import { Button } from "@/components/ui/Button";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { SourceList } from "./SourceList";
import { severityBadgeClass } from "@/lib/severity";

const severityOrder: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const severityOptions: Array<Severity | "all"> = ["all", "critical", "high", "medium", "low"];
type SortKey = "priority" | "location" | "category" | "severity" | "confidence";
type SortDirection = "asc" | "desc";

export function LandmineMap({ landmines }: { landmines: Landmine[] }) {
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [category, setCategory] = useState<LandmineCategory | "all">("all");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "priority", direction: "asc" });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const categories = useMemo(() => Array.from(new Set(landmines.map((landmine) => landmine.category))).sort(), [landmines]);
  const filtered = useMemo(
    () =>
      landmines
        .filter((landmine) => severity === "all" || landmine.severity === severity)
        .filter((landmine) => category === "all" || landmine.category === category)
        .sort((a, b) => compareLandmines(a, b, sort.key, sort.direction)),
    [category, landmines, severity, sort],
  );

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" },
    );
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCsv() {
    const csv = toLandmineCsv(filtered);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "codebrief-landmines.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section id="landmine-map" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink">Landmine map</h2>
          <p className="mt-2 text-sm leading-6 text-charcoal">
            Filter, sort, expand, and export evidenced risks before planning a handoff or refactor.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="grid gap-1 text-xs text-muted">
            Severity
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value as Severity | "all")}
              className="focus-ring h-10 rounded-md border border-border bg-card px-3 text-sm text-ink"
            >
              {severityOptions.map((option) => (
                <option key={option} value={option}>{option === "all" ? "All severities" : option}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as LandmineCategory | "all")}
              className="focus-ring h-10 rounded-md border border-border bg-card px-3 text-sm text-ink"
            >
              <option value="all">All categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <Button type="button" variant="secondary" onClick={exportCsv} disabled={filtered.length === 0} className="self-end">
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded border border-border">
        {/* table-fixed: a filter/transform on the StoryScroll Reveal ancestor defeats
            overflow-x clipping, so an auto-width table's min-content width leaks out and
            scrolls the whole page. Fixed layout makes columns respect the container. */}
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[15%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[25%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead className="bg-panel2 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <SortableHeader label="Location" active={sort.key === "location"} direction={sort.direction} onClick={() => toggleSort("location")} />
              <SortableHeader label="Category" active={sort.key === "category"} direction={sort.direction} onClick={() => toggleSort("category")} />
              <SortableHeader label="Severity" active={sort.key === "severity"} direction={sort.direction} onClick={() => toggleSort("severity")} />
              <SortableHeader label="Confidence" active={sort.key === "confidence"} direction={sort.direction} onClick={() => toggleSort("confidence")} />
              <th className="px-4 py-3">Remediation</th>
              <SortableHeader label="Priority" active={sort.key === "priority"} direction={sort.direction} onClick={() => toggleSort("priority")} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((landmine) => {
              const id = landmineId(landmine);
              const isExpanded = expanded.has(id);
              return (
                <Fragment key={id}>
                  <tr
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => toggleExpanded(id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleExpanded(id);
                      }
                    }}
                    className="cursor-pointer border-t border-border bg-panel align-top transition-colors hover:bg-panel2"
                  >
                    <td className="min-w-56 px-4 py-4">
                      <div className="flex items-start gap-2">
                        {isExpanded ? <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-mute" /> : <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-mute" />}
                        <span className="break-all font-mono text-xs text-ink">{landmine.location}</span>
                      </div>
                    </td>
                    <td className="min-w-40 px-4 py-4">{landmine.category}</td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${severityBadgeClass[landmine.severity]}`}>{landmine.severity}</span>
                    </td>
                    <td className="px-4 py-4">
                      <ConfidenceBadge confidence={landmine.confidence} />
                    </td>
                    <td className="min-w-80 px-4 py-4">
                      <div className="text-charcoal">{landmine.remediation}</div>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-mute">{landmine.priority}</td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-t border-border bg-bone/50">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                          <div>
                            <div className="font-mono text-xs uppercase text-mute">Evidence and explanation</div>
                            <p className="mt-2 text-sm leading-6 text-body">{landmine.explanation}</p>
                            <SourceList sources={landmine.evidence} />
                          </div>
                          <div>
                            <div className="font-mono text-xs uppercase text-mute">Remediation plan</div>
                            <p className="mt-2 text-sm leading-6 text-body">{landmine.remediation}</p>
                            <div className="mt-3 rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-charcoal">
                              Estimate: {landmine.remediationEstimate}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {filtered.length === 0 ? (
              <tr className="border-t border-border bg-panel">
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                  No landmines match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SortableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-3">
      <button type="button" onClick={onClick} className="focus-ring inline-flex cursor-pointer items-center gap-1 rounded text-left transition-colors hover:text-ink">
        {label}
        <ArrowUpDown className={active ? "h-3.5 w-3.5 text-ink" : "h-3.5 w-3.5"} />
        <span className="sr-only">{active ? `sorted ${direction}` : "sort"}</span>
      </button>
    </th>
  );
}

function compareLandmines(a: Landmine, b: Landmine, key: SortKey, direction: SortDirection): number {
  const sign = direction === "asc" ? 1 : -1;
  if (key === "severity") return sign * (severityOrder[a.severity] - severityOrder[b.severity] || a.priority - b.priority);
  if (key === "priority") return sign * (a.priority - b.priority || severityOrder[a.severity] - severityOrder[b.severity]);
  if (key === "confidence") return sign * (a.confidence - b.confidence || a.priority - b.priority);
  return sign * String(a[key]).localeCompare(String(b[key]));
}

function landmineId(landmine: Landmine): string {
  return `${landmine.location}-${landmine.category}-${landmine.priority}`;
}

function toLandmineCsv(landmines: Landmine[]): string {
  const rows = landmines.map((landmine) => [
    landmine.location,
    landmine.category,
    landmine.severity,
    landmine.priority,
    `${Math.round(landmine.confidence * 100)}%`,
    landmine.explanation,
    landmine.remediation,
    landmine.remediationEstimate,
    formatEvidence(landmine.evidence),
  ]);
  return [["Location", "Category", "Severity", "Priority", "Confidence", "Explanation", "Remediation", "Estimate", "Evidence"], ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

function formatEvidence(sources: SourceCitation[]): string {
  return sources
    .map((source) => source.path || source.url || source.hash || source.section || source.excerpt || source.type)
    .join(" | ");
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}
