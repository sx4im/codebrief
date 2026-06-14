import type { CommitSummary, RiskFileScore } from "@codebrief/shared";

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;
const STALE_MONTHS = 12;

export interface StaleHotspot {
  path: string;
  lastModifiedAt: string;
  monthsSinceLastModified: number;
  incomingDependencies: number;
  complexity: number;
  evidence: string;
}

// PRD Phase 1 / Step 1.3 "recency map": last modified (last commit) date per file
// from the sampled commit log. A file touched by several commits keeps the latest.
export function buildRecencyMap(commits: CommitSummary[]): Record<string, string> {
  const latest = new Map<string, number>();
  for (const commit of commits) {
    const timestamp = Date.parse(commit.date);
    if (Number.isNaN(timestamp)) continue;
    for (const file of commit.files) {
      const previous = latest.get(file) ?? 0;
      if (timestamp > previous) latest.set(file, timestamp);
    }
  }
  const map: Record<string, string> = {};
  for (const [file, timestamp] of latest) map[file] = new Date(timestamp).toISOString();
  return map;
}

// Load-bearing files (top 20% by dependency centrality) that have not been modified
// in over a year: dangerous because the rest of the system leans on code nobody is
// maintaining. Complements complexity bombs (central + complex) and silos (central +
// single owner). Files absent from the recency map are not flagged — without a last
// modified date their staleness cannot be quantified honestly.
export function detectStaleHotspots(
  riskScores: RiskFileScore[],
  recencyMap: Record<string, string>,
  now?: Date,
): StaleHotspot[] {
  const central = riskScores
    .filter((score) => score.incomingDependencies > 0)
    .sort((a, b) => b.incomingDependencies - a.incomingDependencies);
  if (central.length === 0) return [];
  const cutoff = Math.max(1, Math.ceil(central.length * 0.2));
  const centralPaths = new Set(central.slice(0, cutoff).map((score) => score.path));

  const timestamps = Object.values(recencyMap)
    .map((date) => Date.parse(date))
    .filter((value) => !Number.isNaN(value));
  const reference = timestamps.length > 0 ? Math.max(...timestamps) : (now?.getTime() ?? Date.now());

  return riskScores
    .filter((score) => centralPaths.has(score.path))
    .flatMap((score) => {
      const lastModified = recencyMap[score.path];
      const lastTimestamp = lastModified ? Date.parse(lastModified) : Number.NaN;
      if (Number.isNaN(lastTimestamp)) return [];
      const monthsSinceLastModified = Math.round((Math.max(0, reference - lastTimestamp) / MS_PER_MONTH) * 10) / 10;
      if (monthsSinceLastModified < STALE_MONTHS) return [];
      return [
        {
          path: score.path,
          lastModifiedAt: new Date(lastTimestamp).toISOString(),
          monthsSinceLastModified,
          incomingDependencies: score.incomingDependencies,
          complexity: score.complexity,
          evidence: `incomingDeps=${score.incomingDependencies}, last modified ${monthsSinceLastModified} months ago (${new Date(lastTimestamp).toISOString().slice(0, 10)})`,
        },
      ];
    })
    .sort((a, b) => b.monthsSinceLastModified - a.monthsSinceLastModified);
}
