import "server-only";
import type { GitHubRepoRef } from "@codebrief/shared";

export async function listGitHubRepos(token: string): Promise<GitHubRepoRef[]> {
  const response = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "codebrief-web",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub repo list failed: ${await response.text()}`);
  }
  const repos = (await response.json()) as Array<{
    owner: { login: string };
    name: string;
    full_name: string;
    default_branch: string;
    html_url: string;
    private: boolean;
  }>;
  return repos.map((repo) => ({
    owner: repo.owner.login,
    name: repo.name,
    fullName: repo.full_name,
    defaultBranch: repo.default_branch,
    htmlUrl: repo.html_url,
    isPrivate: repo.private,
  }));
}

