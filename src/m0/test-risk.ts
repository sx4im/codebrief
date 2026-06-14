import { computeRiskScores } from "./risk.js";
import type { AstFileSummary, CommitSummary, GitHubTreeFile } from "./types.js";

const astFiles: AstFileSummary[] = [
  {
    path: "src/core.ts",
    imports: [],
    exports: ["core"],
    complexity: 12,
    nodeCount: 100,
    parseError: false,
    source: { type: "file", path: "src/core.ts" },
  },
  {
    path: "src/feature.ts",
    imports: ["./core"],
    exports: ["feature"],
    complexity: 2,
    nodeCount: 25,
    parseError: false,
    source: { type: "file", path: "src/feature.ts" },
  },
  {
    path: "src/safe.ts",
    imports: [],
    exports: ["safe"],
    complexity: 1,
    nodeCount: 12,
    parseError: false,
    source: { type: "file", path: "src/safe.ts" },
  },
];

const commits: CommitSummary[] = [
  commit("a", ["src/core.ts"]),
  commit("b", ["src/core.ts"]),
  commit("c", ["src/core.ts"]),
  commit("d", ["src/feature.ts"]),
];

const treeFiles: GitHubTreeFile[] = [
  treeFile("src/core.ts"),
  treeFile("src/feature.ts"),
  treeFile("src/safe.ts"),
  treeFile("tests/safe.test.ts"),
];

const scores = computeRiskScores(astFiles, commits, treeFiles);
const [highest] = scores;
if (!highest || highest.path !== "src/core.ts") {
  throw new Error(`Expected src/core.ts to rank highest, got ${JSON.stringify(scores)}`);
}
if (highest.churnCount !== 3 || highest.complexity !== 12 || highest.incomingDependencies !== 1) {
  throw new Error(`Unexpected core.ts risk evidence: ${JSON.stringify(highest)}`);
}
if (!highest.sources.some((source) => source.type === "file" && source.path === "src/core.ts")) {
  throw new Error(`Expected file source evidence for highest risk file: ${JSON.stringify(highest.sources)}`);
}

const safe = scores.find((score) => score.path === "src/safe.ts");
if (!safe?.hasLikelyTest) {
  throw new Error(`Expected safe.ts to be detected as likely tested, got ${JSON.stringify(safe)}`);
}
if (!scores.every((score) => score.evidence.includes("churn=") && score.evidence.includes("complexity="))) {
  throw new Error(`Expected every risk score to include raw evidence, got ${JSON.stringify(scores)}`);
}

process.stdout.write("risk tests passed\n");

function commit(sha: string, files: string[]): CommitSummary {
  return {
    sha,
    message: `commit ${sha}`,
    authorName: "tester",
    date: "2026-06-11T00:00:00Z",
    htmlUrl: `https://example.com/${sha}`,
    files,
  };
}

function treeFile(path: string): GitHubTreeFile {
  return {
    path,
    mode: "100644",
    type: "blob",
    sha: path,
    size: 100,
    url: `https://example.com/${path}`,
  };
}
