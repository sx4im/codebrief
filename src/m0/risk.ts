import path from "node:path";
import { resolveImport } from "./ast.js";
import type { AstFileSummary, CommitSummary, GitHubTreeFile, RiskFileScore } from "./types.js";

export function computeRiskScores(
  astFiles: AstFileSummary[],
  commits: CommitSummary[],
  treeFiles: GitHubTreeFile[],
): RiskFileScore[] {
  const churn = buildChurnMap(commits);
  const incomingDependencies = buildIncomingDependencyMap(astFiles);
  const testNames = new Set(
    treeFiles
      .map((file) => file.path)
      .filter((filePath) => /\.(test|spec)\.[tj]sx?$/.test(filePath) || /(^|\/)(test|tests|__tests__)(\/|$)/.test(filePath))
      .map((filePath) => normalizeForTestMatch(filePath)),
  );

  const maxChurn = Math.max(...astFiles.map((file) => churn.get(file.path) || 0), 1);
  const maxComplexity = Math.max(...astFiles.map((file) => file.complexity), 1);
  const maxIncoming = Math.max(...astFiles.map((file) => incomingDependencies.get(file.path) || 0), 1);

  return astFiles
    .map((file) => {
      const churnCount = churn.get(file.path) || 0;
      const incoming = incomingDependencies.get(file.path) || 0;
      const hasLikelyTest = testNames.has(normalizeForTestMatch(file.path));
      const churnScore = churnCount / maxChurn;
      const complexityScore = file.complexity / maxComplexity;
      const centralityScore = incoming / maxIncoming;
      const noTestScore = hasLikelyTest ? 0 : 1;
      const score = round2(
        churnScore * 0.35 + complexityScore * 0.3 + centralityScore * 0.2 + noTestScore * 0.15,
      );

      return {
        path: file.path,
        score,
        churnCount,
        complexity: file.complexity,
        incomingDependencies: incoming,
        hasLikelyTest,
        evidence: `churn=${churnCount}, complexity=${file.complexity}, incomingDeps=${incoming}, likelyTest=${hasLikelyTest}`,
        sources: [{ type: "file" as const, path: file.path }],
      };
    })
    .sort((a, b) => b.score - a.score);
}

function buildChurnMap(commits: CommitSummary[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const commit of commits) {
    for (const file of commit.files) {
      map.set(file, (map.get(file) || 0) + 1);
    }
  }
  return map;
}

function buildIncomingDependencyMap(astFiles: AstFileSummary[]): Map<string, number> {
  const knownFiles = new Set(astFiles.map((file) => file.path));
  const incoming = new Map<string, number>();
  for (const file of astFiles) {
    for (const importPath of file.imports) {
      const resolved = resolveImport(file.path, importPath, knownFiles);
      if (resolved) {
        incoming.set(resolved, (incoming.get(resolved) || 0) + 1);
      }
    }
  }
  return incoming;
}

function normalizeForTestMatch(filePath: string): string {
  const basename = path.posix.basename(filePath).replace(/\.(test|spec)\.[tj]sx?$/, "").replace(/\.[tj]sx?$/, "");
  return basename.toLowerCase();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
