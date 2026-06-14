import type { AnalysisConfig, CommitSummary, GitHubRepoRef, GitHubTreeFile, IssueSummary, PullRequestSummary } from "@codebrief/shared";
import { GitHubApiClient } from "./github-client.js";

export interface RepoIngestion {
  repo: GitHubRepoRef;
  readme: string;
  treeFiles: GitHubTreeFile[];
  commits: CommitSummary[];
  pullRequests: PullRequestSummary[];
  issues: IssueSummary[];
}

export async function ingestRepository(
  client: GitHubApiClient,
  owner: string,
  repoName: string,
  config: AnalysisConfig,
): Promise<RepoIngestion> {
  const repo = await client.getRepo(owner, repoName);
  const [readme, treeFiles, commits, pullRequests, issues] = await Promise.all([
    client.getReadme(owner, repoName).catch(() => ""),
    client.getTree(owner, repoName, repo.defaultBranch),
    client.getCommits(owner, repoName, config.scopeCommits),
    client.getMergedPullRequests(owner, repoName, config.scopePullRequests),
    client.getRecentIssues(owner, repoName, config.scopeIssues),
  ]);
  return { repo, readme, treeFiles, commits, pullRequests, issues };
}
