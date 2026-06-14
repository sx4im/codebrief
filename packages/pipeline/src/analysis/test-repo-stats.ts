import type { CommitSummary, GitHubRepoRef, GitHubTreeFile, PullRequestSummary } from "@codebrief/shared";
import { buildRepoStats, computeCommitsPerMonth, computeRepoAgeDays } from "./repo-stats.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function commit(date: string, author = "alice"): CommitSummary {
  return { sha: Math.random().toString(16).slice(2), message: "c", authorName: author, date, htmlUrl: "https://example.com/c", files: ["a.ts"] };
}

// --- computeRepoAgeDays ---
{
  const now = new Date("2026-06-13T00:00:00Z");
  assert(computeRepoAgeDays("2026-06-03T00:00:00Z", now) === 10, "expected 10 days old");
  assert(computeRepoAgeDays(undefined, now) === undefined, "missing createdAt -> undefined");
  assert(computeRepoAgeDays("not-a-date", now) === undefined, "invalid createdAt -> undefined");
  // Future creation date clamps to 0 rather than going negative.
  assert(computeRepoAgeDays("2027-01-01T00:00:00Z", now) === 0, "future createdAt clamps to 0");
}

// --- computeCommitsPerMonth ---
{
  assert(computeCommitsPerMonth([]) === undefined, "no commits -> undefined");
  assert(computeCommitsPerMonth([commit("2026-06-01T00:00:00Z")]) === undefined, "single commit -> undefined (no span)");
  // 4 commits spanning ~30.44 days -> ~4 commits/month.
  const monthSpan = computeCommitsPerMonth([
    commit("2026-05-01T00:00:00Z"),
    commit("2026-05-10T00:00:00Z"),
    commit("2026-05-20T00:00:00Z"),
    commit("2026-05-31T10:33:36Z"),
  ]);
  assert(monthSpan !== undefined && monthSpan >= 3.5 && monthSpan <= 4.5, `expected ~4 commits/month, got ${monthSpan}`);
}

// --- buildRepoStats integration ---
{
  const repo: GitHubRepoRef = {
    owner: "o",
    name: "r",
    fullName: "o/r",
    defaultBranch: "main",
    htmlUrl: "https://github.com/o/r",
    isPrivate: false,
    createdAt: "2025-06-13T00:00:00Z",
  };
  const treeFiles: GitHubTreeFile[] = [
    { path: "a.ts", mode: "100644", type: "blob", sha: "1", url: "https://example.com/a" },
    { path: "b.ts", mode: "100644", type: "blob", sha: "2", url: "https://example.com/b" },
    { path: "c.py", mode: "100644", type: "blob", sha: "3", url: "https://example.com/c" },
  ];
  const commits: CommitSummary[] = [commit("2026-06-01T00:00:00Z", "alice"), commit("2026-06-11T00:00:00Z", "bob")];
  const pullRequests: PullRequestSummary[] = [];

  const stats = buildRepoStats({ repo, treeFiles, commits, pullRequests, now: new Date("2026-06-13T00:00:00Z") });
  assert(stats.fileCount === 3, "file count");
  assert(stats.commitCount === 2, "commit count");
  assert(stats.contributorCount === 2, "contributor count");
  assert(stats.languageBreakdown.ts === 2 && stats.languageBreakdown.py === 1, "language breakdown");
  assert(stats.repoAgeDays === 365, `expected 365 days old, got ${stats.repoAgeDays}`);
  assert(stats.commitsPerMonth !== undefined && stats.commitsPerMonth > 0, "commits/month populated");
  // Missing createdAt leaves repoAgeDays undefined without throwing.
  const noDate = buildRepoStats({ repo: { ...repo, createdAt: undefined }, treeFiles, commits, pullRequests });
  assert(noDate.repoAgeDays === undefined, "missing createdAt -> repoAgeDays undefined");
}

process.stdout.write("repo stats tests passed\n");
