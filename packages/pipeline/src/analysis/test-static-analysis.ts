import type { CommitSummary, RiskFileScore } from "@codebrief/shared";
import { detectComplexityBombs } from "./complexity.js";
import { detectSilos } from "./silos.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function riskScore(path: string, complexity: number, incomingDependencies: number): RiskFileScore {
  return {
    path,
    score: 0,
    churnCount: 0,
    complexity,
    incomingDependencies,
    hasLikelyTest: false,
    evidence: `complexity=${complexity}, incomingDeps=${incomingDependencies}`,
  };
}

function commit(authorName: string, date: string, files: string[]): CommitSummary {
  return {
    sha: Math.random().toString(16).slice(2),
    message: "change",
    authorName,
    date,
    htmlUrl: "https://example.com/commit",
    files,
  };
}

// --- detectComplexityBombs: top-10% complexity AND top-20% centrality ---
{
  const scores: RiskFileScore[] = [
    riskScore("src/bomb.ts", 100, 80), // top complexity AND top centrality -> bomb
    riskScore("src/complex-only.ts", 95, 1), // top complexity, low centrality -> not a bomb
    riskScore("src/central-only.ts", 3, 90), // top centrality, low complexity -> not a bomb
    riskScore("src/zero-deps.ts", 120, 0), // very complex but nothing imports it -> excluded by guard
    riskScore("src/filler-a.ts", 2, 10),
    riskScore("src/filler-b.ts", 2, 9),
  ];
  // Pad so cutoffs leave room for the intersection to be meaningful.
  for (let i = 0; i < 14; i += 1) scores.push(riskScore(`src/filler-${i}.ts`, 2, 1));

  const bombs = detectComplexityBombs(scores);
  const paths = bombs.map((bomb) => bomb.path);
  assert(paths.includes("src/bomb.ts"), `expected src/bomb.ts to be flagged, got ${JSON.stringify(paths)}`);
  assert(!paths.includes("src/complex-only.ts"), "high-complexity but low-centrality file must not be a complexity bomb");
  assert(!paths.includes("src/central-only.ts"), "high-centrality but low-complexity file must not be a complexity bomb");
  assert(!paths.includes("src/zero-deps.ts"), "file with zero incoming dependencies must be excluded");
  const bomb = bombs.find((entry) => entry.path === "src/bomb.ts");
  assert(!!bomb && bomb.complexityRank >= 1 && bomb.centralityRank >= 1, "complexity bomb must carry rank evidence");
  assert(!!bomb && bomb.evidence.includes("complexity=100"), "complexity bomb evidence must reference the metric");
}

// --- detectComplexityBombs: empty / no-signal inputs ---
{
  assert(detectComplexityBombs([]).length === 0, "no scores should yield no bombs");
  assert(
    detectComplexityBombs([riskScore("a.ts", 1, 0), riskScore("b.ts", 1, 0)]).length === 0,
    "trivial files must not be flagged",
  );
}

// --- detectSilos: active vs inactive owner cross-reference ---
{
  // core.ts and legacy.ts are the two highest-risk files -> critical (top 20% of 10).
  const scores: RiskFileScore[] = [
    riskScore("core.ts", 50, 30),
    riskScore("legacy.ts", 40, 20),
  ];
  for (let i = 0; i < 8; i += 1) scores.push(riskScore(`other-${i}.ts`, 2, 1));

  const commits: CommitSummary[] = [
    // alice owns core.ts and is still active (latest commit is the repo's latest).
    commit("alice", "2026-06-01T00:00:00Z", ["core.ts"]),
    commit("alice", "2026-05-20T00:00:00Z", ["core.ts"]),
    commit("alice", "2026-05-10T00:00:00Z", ["core.ts"]),
    commit("alice", "2026-05-01T00:00:00Z", ["core.ts"]),
    commit("alice", "2026-04-20T00:00:00Z", ["core.ts"]),
    commit("alice", "2026-04-10T00:00:00Z", ["core.ts"]),
    commit("alice", "2026-04-01T00:00:00Z", ["core.ts"]),
    commit("alice", "2026-03-20T00:00:00Z", ["core.ts"]),
    commit("carol", "2026-03-10T00:00:00Z", ["core.ts"]),
    commit("carol", "2026-03-05T00:00:00Z", ["core.ts"]),
    // bob owns legacy.ts but went quiet ~20 months before the repo's latest commit.
    commit("bob", "2024-10-01T00:00:00Z", ["legacy.ts"]),
    commit("bob", "2024-09-20T00:00:00Z", ["legacy.ts"]),
    commit("bob", "2024-09-10T00:00:00Z", ["legacy.ts"]),
    commit("bob", "2024-09-01T00:00:00Z", ["legacy.ts"]),
    commit("bob", "2024-08-20T00:00:00Z", ["legacy.ts"]),
    commit("bob", "2024-08-10T00:00:00Z", ["legacy.ts"]),
    commit("bob", "2024-08-01T00:00:00Z", ["legacy.ts"]),
    commit("bob", "2024-07-20T00:00:00Z", ["legacy.ts"]),
    commit("dave", "2024-07-10T00:00:00Z", ["legacy.ts"]),
    commit("dave", "2024-07-05T00:00:00Z", ["legacy.ts"]),
  ];

  const silos = detectSilos(commits, scores);
  assert(silos.length === 2, `expected 2 silos, got ${silos.length}`);

  const core = silos.find((silo) => silo.file === "core.ts");
  const legacy = silos.find((silo) => silo.file === "legacy.ts");
  assert(!!core && core.author === "alice" && Math.abs(core.authorShare - 0.8) < 1e-9, "core.ts silo should be alice @ 0.8");
  assert(!!core && core.authorActive === true, "alice should be flagged active");
  assert(!!legacy && legacy.author === "bob", "legacy.ts silo should be bob");
  assert(!!legacy && legacy.authorActive === false, "bob should be flagged inactive");
  assert(
    !!legacy && (legacy.monthsSinceAuthorLastCommit ?? 0) > 12,
    `bob's inactivity gap should exceed 12 months, got ${legacy?.monthsSinceAuthorLastCommit}`,
  );
  assert(!!legacy && legacy.authorLastCommitAt !== null, "inactive owner must still report a last-commit date");

  // Inactive-owner silos sort first (highest bus-factor risk).
  assert(silos[0]?.file === "legacy.ts", "inactive-owner silo must be surfaced first");
}

// --- detectSilos: shared ownership is not a silo ---
{
  const scores: RiskFileScore[] = [riskScore("shared.ts", 30, 10)];
  for (let i = 0; i < 4; i += 1) scores.push(riskScore(`x-${i}.ts`, 2, 1));
  const commits: CommitSummary[] = [
    commit("alice", "2026-01-01T00:00:00Z", ["shared.ts"]),
    commit("bob", "2026-01-02T00:00:00Z", ["shared.ts"]),
    commit("carol", "2026-01-03T00:00:00Z", ["shared.ts"]),
  ];
  assert(detectSilos(commits, scores).length === 0, "evenly shared file must not be flagged as a silo");
}

process.stdout.write("static analysis tests passed\n");
