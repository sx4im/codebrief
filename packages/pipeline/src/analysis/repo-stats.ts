import type { CommitSummary, GitHubRepoRef, GitHubTreeFile, PullRequestSummary, RepoStats } from "@codebrief/shared";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAYS_PER_MONTH = 30.44;

// PRD Phase 4 / Agent 4 input: the Synthesis Agent's raw stats include
// "commit frequency" and "repo age". Both were absent from repoStats — repoAgeDays
// existed in the schema but was never populated. These deterministic helpers fill them.

export function buildRepoStats(input: {
  repo: GitHubRepoRef;
  treeFiles: GitHubTreeFile[];
  commits: CommitSummary[];
  pullRequests: PullRequestSummary[];
  now?: Date;
}): RepoStats {
  const now = input.now ?? new Date();
  return {
    fileCount: input.treeFiles.length,
    languageBreakdown: languageBreakdown(input.treeFiles.map((file) => file.path)),
    commitCount: input.commits.length,
    pullRequestCount: input.pullRequests.length,
    contributorCount: new Set(input.commits.map((commit) => commit.authorName)).size,
    repoAgeDays: computeRepoAgeDays(input.repo.createdAt, now),
    commitsPerMonth: computeCommitsPerMonth(input.commits),
  };
}

export function computeRepoAgeDays(createdAt: string | undefined, now: Date): number | undefined {
  if (!createdAt) return undefined;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return undefined;
  return Math.max(0, Math.floor((now.getTime() - created) / MS_PER_DAY));
}

// Commit cadence across the span of the sampled commits (newest to oldest), which
// describes recent activity rather than lifetime average — the commit window is
// bounded, so dividing by full repo age would understate active repos.
export function computeCommitsPerMonth(commits: CommitSummary[]): number | undefined {
  const timestamps = commits.map((commit) => Date.parse(commit.date)).filter((value) => !Number.isNaN(value));
  if (timestamps.length < 2) return undefined;
  const newest = Math.max(...timestamps);
  const oldest = Math.min(...timestamps);
  const spanDays = Math.max(1, (newest - oldest) / MS_PER_DAY);
  const rate = (timestamps.length / spanDays) * DAYS_PER_MONTH;
  return Math.round(rate * 10) / 10;
}

export function languageBreakdown(paths: string[]): Record<string, number> {
  const output: Record<string, number> = {};
  for (const path of paths) {
    const ext = path.split(".").pop() || "unknown";
    output[ext] = (output[ext] || 0) + 1;
  }
  return output;
}
