import type { Severity } from "@codebrief/shared";

// Severity styling for the cream/white surfaces (DESIGN.md). Tinted chip + colored
// text reads clearly on light backgrounds; the hex map is for the canvas-rendered
// architecture diagram. Kept in one place so the brief views and the diagram agree.
export const severityBadgeClass: Record<Severity, string> = {
  critical: "border-severity-critical/30 bg-severity-critical/10 text-severity-critical",
  high: "border-severity-high/30 bg-severity-high/10 text-severity-high",
  medium: "border-severity-medium/30 bg-severity-medium/10 text-severity-medium",
  low: "border-severity-low/30 bg-severity-low/10 text-severity-low",
};

export const severityTextClass: Record<Severity, string> = {
  critical: "text-severity-critical",
  high: "text-severity-high",
  medium: "text-severity-medium",
  low: "text-severity-low",
};

export const severityHex: Record<Severity | "none", string> = {
  critical: "#c01f00",
  high: "#d2541b",
  medium: "#b45309",
  low: "#2b9a66",
  none: "#bbbbbb",
};
