import path from "node:path";
import type { CommitSummary, FileAstSummary, GitHubTreeFile, RiskFileScore } from "@codebrief/shared";

export function scoreFiles(astFiles: FileAstSummary[], commits: CommitSummary[], treeFiles: GitHubTreeFile[]): RiskFileScore[] {
  const churn = new Map<string, number>();
  for (const commit of commits) {
    for (const file of commit.files) churn.set(file, (churn.get(file) || 0) + 1);
  }
  const incoming = buildIncoming(astFiles);
  const tests = new Set(
    treeFiles
      .map((file) => file.path)
      .filter(
        (file) =>
          /\.(test|spec)\.[tj]sx?$/.test(file) ||
          /(^|\/)(test|tests|__tests__|spec)(\/|$)/.test(file) ||
          /(_test\.go|_spec\.rb|Test\.java|test_.*\.py)$/.test(file),
      )
      .map(normalizeForTest),
  );
  const maxChurn = Math.max(1, ...astFiles.map((file) => churn.get(file.path) || 0));
  const maxComplexity = Math.max(1, ...astFiles.map((file) => file.complexity));
  const maxIncoming = Math.max(1, ...astFiles.map((file) => incoming.get(file.path) || 0));

  return astFiles
    .map((file) => {
      const churnCount = churn.get(file.path) || 0;
      const incomingDependencies = incoming.get(file.path) || 0;
      const hasLikelyTest = tests.has(normalizeForTest(file.path));
      const score =
        (churnCount / maxChurn) * 0.35 +
        (file.complexity / maxComplexity) * 0.3 +
        (incomingDependencies / maxIncoming) * 0.2 +
        (hasLikelyTest ? 0 : 0.15);
      return {
        path: file.path,
        score: Math.round(score * 100) / 100,
        churnCount,
        complexity: file.complexity,
        incomingDependencies,
        hasLikelyTest,
        evidence: `churn=${churnCount}, complexity=${file.complexity}, incomingDeps=${incomingDependencies}, likelyTest=${hasLikelyTest}`,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function buildIncoming(astFiles: FileAstSummary[]): Map<string, number> {
  const known = new Set(astFiles.map((file) => file.path));
  const incoming = new Map<string, number>();
  for (const file of astFiles) {
    for (const importPath of file.imports) {
      const resolved = resolveImport(file.path, importPath, known);
      if (resolved) incoming.set(resolved, (incoming.get(resolved) || 0) + 1);
    }
  }
  return incoming;
}

export function resolveImport(fromFile: string, importPath: string, known: Set<string>): string | null {
  if (!importPath.startsWith(".")) return null;
  const normalizedImport = normalizeRelativeImport(importPath);
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), normalizedImport));
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rb", ".java", ".rs"];
  const indexFiles = ["index.ts", "index.tsx", "index.js", "index.jsx", "__init__.py", "mod.rs"];
  return [
    base,
    ...extensions.map((extension) => `${base}${extension}`),
    ...indexFiles.map((indexFile) => path.posix.join(base, indexFile)),
  ].find((candidate) => known.has(candidate)) || null;
}

function normalizeForTest(filePath: string): string {
  return path.posix
    .basename(filePath)
    .replace(/\.(test|spec)\.[tj]sx?$/, "")
    .replace(/(_test\.go|_spec\.rb|Test\.java)$/, "")
    .replace(/^test_/, "")
    .replace(/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|rs)$/, "")
    .toLowerCase();
}

function normalizeRelativeImport(importPath: string): string {
  if (importPath.startsWith("./") || importPath.startsWith("../")) return importPath;
  const parentDots = importPath.match(/^\.+/)?.[0] || ".";
  const symbol = importPath.slice(parentDots.length);
  if (parentDots.length <= 1) return `./${symbol}`;
  return `${"../".repeat(parentDots.length - 1)}${symbol}`;
}
