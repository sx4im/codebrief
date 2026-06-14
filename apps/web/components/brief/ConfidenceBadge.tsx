import { cn } from "@/lib/utils";

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const label = `${Math.round(confidence * 100)}%`;
  const tone = confidence === 0 ? "border-danger/50 text-danger" : confidence < 0.5 ? "border-amber/50 text-amber" : "border-border text-muted";
  return (
    <span className={cn("inline-flex items-center rounded border px-2 py-1 font-mono text-[11px] uppercase", tone)}>
      confidence {label}
    </span>
  );
}
