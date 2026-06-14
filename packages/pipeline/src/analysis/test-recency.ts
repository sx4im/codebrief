import type { CommitSummary, RiskFileScore } from "@codebrief/shared";
import { buildRecencyMap, detectStaleHotspots } from "./recency.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function commit(date: string, files: string[]): CommitSummary {
  return { sha: Math.random().toString(16).slice(2), message: "c", authorName: "a", date, htmlUrl: "https://example.com/c", files };
}

function riskScore(path: string, complexity: number, incomingDependencies: number): RiskFileScore {
  return { path, score: 0, churnCount: 0, complexity, incomingDependencies, hasLikelyTest: false, evidence: "e" };
}

// --- buildRecencyMap keeps the latest commit date per file ---
{
  const map = buildRecencyMap([
    commit("2026-01-01T00:00:00Z", ["a.ts", "b.ts"]),
    commit("2026-03-01T00:00:00Z", ["a.ts"]),
    commit("not-a-date", ["c.ts"]),
  ]);
  assert(map["a.ts"] === "2026-03-01T00:00:00.000Z", `a.ts should keep the latest date, got ${map["a.ts"]}`);
  assert(map["b.ts"] === "2026-01-01T00:00:00.000Z", "b.ts should keep its only date");
  assert(!("c.ts" in map), "unparseable commit date should be skipped");
}

// --- detectStaleHotspots: central + stale flagged; recent/non-central excluded ---
{
  // core.ts and api.ts are the most central (top 20% of 10 -> top 2).
  const scores: RiskFileScore[] = [
    riskScore("core.ts", 20, 40),
    riskScore("api.ts", 18, 30),
  ];
  for (let i = 0; i < 8; i += 1) scores.push(riskScore(`leaf-${i}.ts`, 3, 1));

  const recency: Record<string, string> = {
    "core.ts": "2024-01-01T00:00:00Z", // ~24 months before the reference -> stale
    "api.ts": "2026-05-01T00:00:00Z", // recent -> not stale
    "leaf-0.ts": "2023-01-01T00:00:00Z", // stale but not central -> excluded
    "stale-extra.ts": "2026-06-01T00:00:00Z", // sets the reference "now"
  };

  const hotspots = detectStaleHotspots(scores, recency);
  const paths = hotspots.map((hotspot) => hotspot.path);
  assert(paths.includes("core.ts"), `expected core.ts flagged stale, got ${JSON.stringify(paths)}`);
  assert(!paths.includes("api.ts"), "recently modified central file must not be flagged");
  assert(!paths.includes("leaf-0.ts"), "stale but non-central file must not be flagged");
  const core = hotspots.find((hotspot) => hotspot.path === "core.ts");
  assert(!!core && core.monthsSinceLastModified >= 12, "stale hotspot must be >= 12 months old");
  assert(!!core && core.incomingDependencies === 40 && core.evidence.includes("incomingDeps=40"), "hotspot carries centrality evidence");
}

// --- central file absent from recency map is not flagged (no date to quantify) ---
{
  const scores: RiskFileScore[] = [riskScore("core.ts", 20, 40)];
  for (let i = 0; i < 4; i += 1) scores.push(riskScore(`leaf-${i}.ts`, 2, 1));
  const hotspots = detectStaleHotspots(scores, { "leaf-0.ts": "2020-01-01T00:00:00Z" });
  assert(hotspots.length === 0, "central file with no recency entry must not be flagged");
}

// --- no central files -> empty ---
{
  assert(detectStaleHotspots([riskScore("x.ts", 2, 0)], {}).length === 0, "no central files -> no hotspots");
}

process.stdout.write("recency tests passed\n");
