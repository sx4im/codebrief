import type { RiskFileScore } from "@codebrief/shared";

export interface ComplexityBomb {
  path: string;
  complexity: number;
  incomingDependencies: number;
  complexityRank: number;
  centralityRank: number;
  evidence: string;
}

/**
 * PRD Phase 2 / Step 2.4: a file is a "complexity bomb" when it sits in the top
 * 10% of files by cyclomatic complexity AND the top 20% by dependency centrality
 * (everything depends on it). High complexity alone is tolerable; high complexity
 * that the rest of the system leans on is the dangerous combination.
 */
export function detectComplexityBombs(riskScores: RiskFileScore[]): ComplexityBomb[] {
  // A file nothing imports cannot be a complexity bomb, and complexity of 1 is the
  // floor for a single linear function, so neither contributes a real signal.
  const scored = riskScores.filter((score) => score.complexity > 1 && score.incomingDependencies > 0);
  if (scored.length === 0) return [];

  const byComplexity = [...scored].sort((a, b) => b.complexity - a.complexity || b.incomingDependencies - a.incomingDependencies);
  const byCentrality = [...scored].sort((a, b) => b.incomingDependencies - a.incomingDependencies || b.complexity - a.complexity);

  const complexityCutoff = Math.max(1, Math.ceil(byComplexity.length * 0.1));
  const centralityCutoff = Math.max(1, Math.ceil(byCentrality.length * 0.2));

  const complexityRanks = new Map(byComplexity.slice(0, complexityCutoff).map((score, index) => [score.path, index + 1]));
  const centralityRanks = new Map(byCentrality.slice(0, centralityCutoff).map((score, index) => [score.path, index + 1]));

  return byComplexity
    .filter((score) => complexityRanks.has(score.path) && centralityRanks.has(score.path))
    .map((score) => {
      const complexityRank = complexityRanks.get(score.path) ?? 0;
      const centralityRank = centralityRanks.get(score.path) ?? 0;
      return {
        path: score.path,
        complexity: score.complexity,
        incomingDependencies: score.incomingDependencies,
        complexityRank,
        centralityRank,
        evidence: `complexity=${score.complexity} (top-10% rank ${complexityRank}), incomingDeps=${score.incomingDependencies} (top-20% rank ${centralityRank})`,
      };
    });
}
