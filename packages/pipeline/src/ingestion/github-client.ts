import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CommitSummary, GitHubRepoRef, GitHubTreeFile, IssueSummary, PullRequestSummary } from "@codebrief/shared";

interface GitHubRepoResponse {
  name: string;
  full_name: string;
  default_branch: string;
  html_url: string;
  private: boolean;
  created_at?: string;
  pushed_at?: string;
}

interface GitTreeResponse {
  tree: GitHubTreeFile[];
}

interface CommitListItem {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
}

interface CommitDetailResponse extends CommitListItem {
  files?: Array<{ filename: string }>;
}

interface LatestCommitSummary {
  date: string;
  htmlUrl: string;
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

interface PullDetailResponse extends PullListItem {
  commits?: number;
}

interface PullCommitItem {
  sha: string;
}

interface PullFileItem {
  filename: string;
}

interface PullReviewCommentItem {
  body: string | null;
  path?: string | null;
  commit_id?: string | null;
  html_url?: string | null;
  created_at?: string | null;
  user?: { login?: string | null } | null;
}

interface PullDiscussionCommentItem {
  body: string | null;
  html_url?: string | null;
  created_at?: string | null;
  user?: { login?: string | null } | null;
}

interface IssueListItem {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
  labels: Array<{ name: string }>;
  comments: number;
  pull_request?: unknown;
}

interface BlobResponse {
  content: string;
  encoding: string;
}

const MAX_PR_REVIEW_COMMENT_DETAILS = 25;
const MAX_PR_DISCUSSION_COMMENTS = 20;
const MAX_PR_COMMITS = 50;
const MAX_PR_FILES = 100;
const MAX_COMMENT_BODY_CHARS = 1_200;

export interface GitHubApiClientOptions {
  cacheDir?: string;
  fetch?: typeof fetch;
  rateLimitRemainingBuffer?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class GitHubApiClient {
  private readonly cacheDir: string;
  private readonly fetchImpl: typeof fetch;
  private readonly rateLimitRemainingBuffer: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly tokenFingerprint: string;

  constructor(private readonly token: string, options: GitHubApiClientOptions = {}) {
    this.cacheDir = options.cacheDir || path.join(process.cwd(), ".cache", "github");
    this.fetchImpl = options.fetch || fetch;
    this.rateLimitRemainingBuffer = options.rateLimitRemainingBuffer ?? 50;
    this.sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.tokenFingerprint = createHash("sha256").update(token).digest("hex").slice(0, 16);
  }

  async getRepo(owner: string, repo: string): Promise<GitHubRepoRef> {
    const data = await this.requestJson<GitHubRepoResponse>(`/repos/${owner}/${repo}`);
    return {
      owner,
      name: data.name,
      fullName: data.full_name,
      defaultBranch: data.default_branch,
      htmlUrl: data.html_url,
      isPrivate: data.private,
      createdAt: data.created_at,
      pushedAt: data.pushed_at,
    };
  }

  async getReadme(owner: string, repo: string): Promise<string> {
    return this.requestText(`/repos/${owner}/${repo}/readme`, "application/vnd.github.raw+json");
  }

  async getTree(owner: string, repo: string, branch: string): Promise<GitHubTreeFile[]> {
    const data = await this.requestJson<GitTreeResponse>(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    );
    return data.tree.filter((item) => item.type === "blob");
  }

  async getBlobText(owner: string, repo: string, sha: string): Promise<string> {
    const blob = await this.requestJson<BlobResponse>(`/repos/${owner}/${repo}/git/blobs/${sha}`);
    if (blob.encoding !== "base64") {
      throw new Error(`Unsupported GitHub blob encoding: ${blob.encoding}`);
    }
    return Buffer.from(blob.content.replace(/\n/g, ""), "base64").toString("utf8");
  }

  async getCommits(owner: string, repo: string, limit: number): Promise<CommitSummary[]> {
    const listed = await this.getPaged<CommitListItem>(`/repos/${owner}/${repo}/commits`, limit);
    const output: CommitSummary[] = [];
    for (const item of listed) {
      const detail = await this.requestJson<CommitDetailResponse>(`/repos/${owner}/${repo}/commits/${item.sha}`);
      output.push({
        sha: item.sha,
        message: item.commit.message.split("\n")[0] || "",
        authorName: item.commit.author?.name || "unknown",
        date: item.commit.author?.date || "",
        htmlUrl: item.html_url,
        files: detail.files?.map((file) => file.filename) || [],
      });
    }
    return output;
  }

  async getLatestCommit(owner: string, repo: string): Promise<LatestCommitSummary> {
    const commits = await this.getPaged<CommitListItem>(`/repos/${owner}/${repo}/commits`, 1);
    const latest = commits[0];
    const date = latest?.commit.author?.date;
    if (!latest || !date) {
      throw new Error(`GitHub repository ${owner}/${repo} has no latest commit date`);
    }
    return { date, htmlUrl: latest.html_url };
  }

  async getMergedPullRequests(owner: string, repo: string, limit: number): Promise<PullRequestSummary[]> {
    const pulls = await this.getPaged<PullListItem>(
      `/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc`,
      limit * 2,
    );
    const mergedPulls = pulls
      .filter((pull) => pull.merged_at)
      .slice(0, limit);
    const output: PullRequestSummary[] = [];
    for (const pull of mergedPulls) {
      const [detail, reviewComments, discussionComments, commits, files] = await Promise.all([
        this.requestJson<PullDetailResponse>(`/repos/${owner}/${repo}/pulls/${pull.number}`),
        this.getPaged<PullReviewCommentItem>(
          `/repos/${owner}/${repo}/pulls/${pull.number}/comments`,
          Math.min(Math.max(pull.review_comments || 0, 0), MAX_PR_REVIEW_COMMENT_DETAILS),
        ),
        this.getPaged<PullDiscussionCommentItem>(
          `/repos/${owner}/${repo}/issues/${pull.number}/comments`,
          Math.min(Math.max(pull.comments || 0, 0), MAX_PR_DISCUSSION_COMMENTS),
        ),
        this.getPaged<PullCommitItem>(`/repos/${owner}/${repo}/pulls/${pull.number}/commits`, MAX_PR_COMMITS),
        this.getPaged<PullFileItem>(`/repos/${owner}/${repo}/pulls/${pull.number}/files`, MAX_PR_FILES),
      ]);
      const body = detail.body ?? pull.body ?? "";
      const changedFilePaths = files.map((file) => file.filename).filter(Boolean);
      const commitShas = commits.map((commit) => commit.sha).filter(Boolean);
      output.push({
        number: pull.number,
        title: detail.title || pull.title,
        body,
        mergedAt: detail.merged_at || pull.merged_at || "",
        htmlUrl: detail.html_url || pull.html_url,
        labels: (detail.labels || pull.labels || []).map((label) => label.name),
        changedFiles: detail.changed_files ?? pull.changed_files ?? changedFilePaths.length,
        comments: detail.comments ?? pull.comments ?? discussionComments.length,
        reviewComments: detail.review_comments ?? pull.review_comments ?? reviewComments.length,
        changedFilePaths,
        commitShas,
        linkedIssueNumbers: linkedIssueNumbers(`${detail.title || pull.title}\n${body}`),
        iterationCount: detail.commits ?? commitShas.length,
        reviewCommentDetails: reviewComments.map((comment) => ({
          body: trimCommentBody(comment.body || ""),
          path: comment.path || undefined,
          commitSha: comment.commit_id || undefined,
          htmlUrl: validUrl(comment.html_url),
          author: comment.user?.login || undefined,
          createdAt: comment.created_at || undefined,
        })).filter((comment) => comment.body),
        discussionComments: discussionComments.map((comment) => ({
          body: trimCommentBody(comment.body || ""),
          htmlUrl: validUrl(comment.html_url),
          author: comment.user?.login || undefined,
          createdAt: comment.created_at || undefined,
        })).filter((comment) => comment.body),
      });
    }
    return output;
  }

  async getRecentIssues(owner: string, repo: string, limit: number): Promise<IssueSummary[]> {
    const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const issues = await this.getPaged<IssueListItem>(
      `/repos/${owner}/${repo}/issues?state=all&sort=updated&direction=desc&since=${encodeURIComponent(since)}`,
      limit * 2,
    );
    return issues
      .filter((issue) => !issue.pull_request)
      .slice(0, limit)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body || "",
        state: issue.state,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        closedAt: issue.closed_at,
        htmlUrl: issue.html_url,
        labels: issue.labels.map((label) => label.name),
        comments: issue.comments,
      }));
  }

  private async getPaged<T>(pathWithQuery: string, limit: number): Promise<T[]> {
    if (limit <= 0) return [];
    const output: T[] = [];
    for (let page = 1; output.length < limit; page += 1) {
      const separator = pathWithQuery.includes("?") ? "&" : "?";
      const batch = await this.requestJson<T[]>(`${pathWithQuery}${separator}per_page=100&page=${page}`);
      output.push(...batch);
      if (batch.length < 100) {
        break;
      }
    }
    return output.slice(0, limit);
  }

  private async requestText(pathWithQuery: string, accept: string): Promise<string> {
    return this.requestCached(pathWithQuery, accept, async (url, headers) => {
      const response = await this.fetchImpl(url, { headers });
      await this.pauseIfRateLimitApproached(response);
      if (!response.ok) {
        throw new Error(`GitHub API ${response.status} for ${pathWithQuery}: ${await response.text()}`);
      }
      return response.text();
    });
  }

  private async requestJson<T>(pathWithQuery: string): Promise<T> {
    return this.requestCached(pathWithQuery, "application/vnd.github+json", async (url, headers) => {
      const response = await this.fetchImpl(url, { headers });
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
    const key = createHash("sha256").update(`${accept}:${this.tokenFingerprint}:${url}`).digest("hex");
    const cachePath = path.join(this.cacheDir, `${key}.json`);
    try {
      return JSON.parse(await readFile(cachePath, "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await mkdir(this.cacheDir, { recursive: true });
    const value = await fetcher(url, {
      Accept: accept,
      Authorization: `Bearer ${this.token}`,
      "User-Agent": "codebrief-pipeline",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    await writeFile(cachePath, JSON.stringify(value, null, 2));
    return value;
  }

  private async pauseIfRateLimitApproached(response: Response): Promise<void> {
    const remaining = Number.parseInt(response.headers.get("x-ratelimit-remaining") || "9999", 10);
    const reset = Number.parseInt(response.headers.get("x-ratelimit-reset") || "0", 10);
    if (remaining > this.rateLimitRemainingBuffer || reset === 0) {
      return;
    }
    const waitMs = Math.max(reset * 1000 - Date.now() + 5000, 0);
    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
  }
}

function trimCommentBody(body: string): string {
  return body.trim().slice(0, MAX_COMMENT_BODY_CHARS);
}

function linkedIssueNumbers(text: string): number[] {
  const output = new Set<number>();
  const patterns = [/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi, /\bGH-(\d+)\b/gi, /(?:^|\s)#(\d+)\b/g];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number.parseInt(match[1] || "", 10);
      if (Number.isInteger(value) && value > 0) output.add(value);
    }
  }
  return Array.from(output).sort((a, b) => a - b);
}

function validUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).toString();
  } catch {
    return undefined;
  }
}
