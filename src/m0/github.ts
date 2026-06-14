import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CommitSummary,
  GitHubRepoMetadata,
  GitHubTreeFile,
  PullRequestSummary,
} from "./types.js";

interface GitHubRepoResponse {
  name: string;
  full_name: string;
  default_branch: string;
  description: string | null;
  html_url: string;
  pushed_at: string | null;
  created_at: string | null;
}

interface GitTreeResponse {
  tree: Array<{
    path: string;
    mode: string;
    type: "blob" | "tree" | "commit";
    sha: string;
    size?: number;
    url: string;
  }>;
}

interface CommitListItem {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    } | null;
  };
}

interface CommitDetailResponse extends CommitListItem {
  files?: Array<{ filename: string }>;
}

interface PullListItem {
  number: number;
  title: string;
  body: string | null;
  merged_at: string | null;
  html_url: string;
  labels: Array<{ name: string }>;
  changed_files: number;
  comments: number;
  review_comments: number;
}

interface BlobResponse {
  content: string;
  encoding: string;
  size: number;
}

export class GitHubClient {
  private readonly cacheDir = path.join(process.cwd(), ".cache", "github");

  constructor(private readonly token: string) {}

  async getRepo(owner: string, repo: string): Promise<GitHubRepoMetadata> {
    const data = await this.requestJson<GitHubRepoResponse>(`/repos/${owner}/${repo}`);
    return {
      owner,
      name: data.name,
      fullName: data.full_name,
      defaultBranch: data.default_branch,
      description: data.description,
      htmlUrl: data.html_url,
      pushedAt: data.pushed_at,
      createdAt: data.created_at,
    };
  }

  async getReadme(owner: string, repo: string): Promise<string> {
    return this.requestText(`/repos/${owner}/${repo}/readme`, {
      accept: "application/vnd.github.raw+json",
    });
  }

  async getTree(owner: string, repo: string, branch: string): Promise<GitHubTreeFile[]> {
    const data = await this.requestJson<GitTreeResponse>(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    );
    return data.tree.filter((item) => item.type === "blob");
  }

  async getRecentCommits(
    owner: string,
    repo: string,
    limit: number,
  ): Promise<CommitSummary[]> {
    const listed = await this.getPaged<CommitListItem>(
      `/repos/${owner}/${repo}/commits`,
      Math.min(limit, 500),
    );
    const summaries: CommitSummary[] = [];
    for (const item of listed.slice(0, limit)) {
      const detail = await this.requestJson<CommitDetailResponse>(
        `/repos/${owner}/${repo}/commits/${item.sha}`,
      );
      summaries.push({
        sha: item.sha,
        message: firstLine(item.commit.message),
        authorName: item.commit.author?.name || "unknown",
        date: item.commit.author?.date || "",
        htmlUrl: item.html_url,
        files: detail.files?.map((file) => file.filename) || [],
      });
    }
    return summaries;
  }

  async getMergedPullRequests(
    owner: string,
    repo: string,
    limit: number,
  ): Promise<PullRequestSummary[]> {
    const candidates = await this.getPaged<PullListItem>(
      `/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc`,
      Math.max(limit * 2, limit),
    );
    return candidates
      .filter((item) => Boolean(item.merged_at))
      .slice(0, limit)
      .map((item) => ({
        number: item.number,
        title: item.title,
        body: item.body || "",
        mergedAt: item.merged_at || "",
        htmlUrl: item.html_url,
        labels: item.labels.map((label) => label.name),
        changedFiles: item.changed_files,
        comments: item.comments,
        reviewComments: item.review_comments,
      }));
  }

  async getBlobText(owner: string, repo: string, sha: string): Promise<string> {
    const blob = await this.requestJson<BlobResponse>(`/repos/${owner}/${repo}/git/blobs/${sha}`);
    if (blob.encoding !== "base64") {
      throw new Error(`Unsupported GitHub blob encoding: ${blob.encoding}`);
    }
    return Buffer.from(blob.content.replace(/\n/g, ""), "base64").toString("utf8");
  }

  private async getPaged<T>(pathWithQuery: string, limit: number): Promise<T[]> {
    const output: T[] = [];
    let page = 1;
    while (output.length < limit) {
      const separator = pathWithQuery.includes("?") ? "&" : "?";
      const pagePath = `${pathWithQuery}${separator}per_page=100&page=${page}`;
      const batch = await this.requestJson<T[]>(pagePath);
      output.push(...batch);
      if (batch.length < 100) {
        break;
      }
      page += 1;
    }
    return output.slice(0, limit);
  }

  private async requestText(pathWithQuery: string, options: { accept?: string } = {}): Promise<string> {
    return this.requestCached<string>(pathWithQuery, options.accept || "application/vnd.github+json", async (url, headers) => {
      const response = await fetch(url, { headers });
      await this.pauseIfRateLimitApproached(response);
      if (!response.ok) {
        throw new Error(`GitHub API ${response.status} for ${pathWithQuery}: ${await response.text()}`);
      }
      return response.text();
    });
  }

  private async requestJson<T>(pathWithQuery: string): Promise<T> {
    return this.requestCached<T>(pathWithQuery, "application/vnd.github+json", async (url, headers) => {
      const response = await fetch(url, { headers });
      await this.pauseIfRateLimitApproached(response);
      if (!response.ok) {
        throw new Error(`GitHub API ${response.status} for ${pathWithQuery}: ${await response.text()}`);
      }
      return response.json() as Promise<T>;
    });
  }

  private async requestCached<T>(
    pathWithQuery: string,
    accept: string,
    fetcher: (url: string, headers: Record<string, string>) => Promise<T>,
  ): Promise<T> {
    const url = `https://api.github.com${pathWithQuery}`;
    const cacheKey = createHash("sha256").update(`${accept}:${url}`).digest("hex");
    const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);
    try {
      const cached = await readFile(cachePath, "utf8");
      return JSON.parse(cached) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await mkdir(this.cacheDir, { recursive: true });
    const value = await fetcher(url, {
      Accept: accept,
      Authorization: `Bearer ${this.token}`,
      "User-Agent": "codebrief-m0",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    await writeFile(cachePath, JSON.stringify(value, null, 2));
    return value;
  }

  private async pauseIfRateLimitApproached(response: Response): Promise<void> {
    const remaining = Number.parseInt(response.headers.get("x-ratelimit-remaining") || "9999", 10);
    const reset = Number.parseInt(response.headers.get("x-ratelimit-reset") || "0", 10);
    if (remaining > 50 || reset === 0) {
      return;
    }
    const waitMs = Math.max(reset * 1000 - Date.now() + 5000, 0);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

function firstLine(input: string): string {
  return input.split("\n")[0]?.trim() || "";
}

