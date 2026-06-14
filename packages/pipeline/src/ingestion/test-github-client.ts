import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GitHubApiClient } from "./github-client.js";

const cacheDir = await mkdtemp(path.join(os.tmpdir(), "codebrief-github-cache-"));

try {
  const firstFetchCalls: Array<{ url: string; authorization: string | null }> = [];
  const firstClient = new GitHubApiClient("token_one", {
    cacheDir,
    fetch: async (url, init) => {
      firstFetchCalls.push({ url: String(url), authorization: headerValue(init?.headers, "Authorization") });
      return jsonResponse({
        name: "repo",
        full_name: "owner/repo",
        default_branch: "main",
        html_url: "https://github.com/owner/repo",
        private: true,
      });
    },
  });

  const first = await firstClient.getRepo("owner", "repo");
  const cached = await firstClient.getRepo("owner", "repo");
  assert.equal(first.fullName, "owner/repo");
  assert.equal(cached.fullName, "owner/repo");
  assert.equal(firstFetchCalls.length, 1);
  assert.equal(firstFetchCalls[0]?.url, "https://api.github.com/repos/owner/repo");
  assert.equal(firstFetchCalls[0]?.authorization, "Bearer token_one");

  const secondFetchCalls: string[] = [];
  const secondClient = new GitHubApiClient("token_two", {
    cacheDir,
    fetch: async (url) => {
      secondFetchCalls.push(String(url));
      return jsonResponse({
        name: "repo",
        full_name: "owner/repo-private-for-token-two",
        default_branch: "main",
        html_url: "https://github.com/owner/repo",
        private: true,
      });
    },
  });
  const second = await secondClient.getRepo("owner", "repo");
  assert.equal(second.fullName, "owner/repo-private-for-token-two");
  assert.equal(secondFetchCalls.length, 1);

  const waits: number[] = [];
  const rateLimitedClient = new GitHubApiClient("token_three", {
    cacheDir: path.join(cacheDir, "rate-limit"),
    rateLimitRemainingBuffer: 50,
    sleep: async (ms) => {
      waits.push(ms);
    },
    fetch: async () =>
      jsonResponse(
        {
          name: "repo",
          full_name: "owner/rate-limited",
          default_branch: "main",
          html_url: "https://github.com/owner/rate-limited",
          private: false,
        },
        { remaining: "2", reset: String(Math.ceil(Date.now() / 1000) + 1) },
      ),
  });
  await rateLimitedClient.getRepo("owner", "rate-limited");
  assert.equal(waits.length, 1);
  assert.ok((waits[0] || 0) >= 1_000);

  const issueFetchUrls: string[] = [];
  const issueClient = new GitHubApiClient("token_issues", {
    cacheDir: path.join(cacheDir, "issues"),
    fetch: async (url) => {
      issueFetchUrls.push(String(url));
      return jsonResponse([
        {
          number: 10,
          title: "Real issue",
          body: "An architectural concern.",
          state: "open",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-02T00:00:00Z",
          closed_at: null,
          html_url: "https://github.com/owner/repo/issues/10",
          labels: [{ name: "architecture" }],
          comments: 3,
        },
        {
          number: 11,
          title: "Pull request returned by issues API",
          body: "",
          state: "closed",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-02T00:00:00Z",
          closed_at: "2026-01-03T00:00:00Z",
          html_url: "https://github.com/owner/repo/pull/11",
          labels: [],
          comments: 0,
          pull_request: {},
        },
      ]);
    },
  });
  const issues = await issueClient.getRecentIssues("owner", "repo", 10);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.number, 10);
  assert.equal(issues[0]?.labels[0], "architecture");
  assert.match(issueFetchUrls[0] || "", /\/repos\/owner\/repo\/issues\?state=all&sort=updated&direction=desc&since=/);

  const prFetchUrls: string[] = [];
  const pullClient = new GitHubApiClient("token_pulls", {
    cacheDir: path.join(cacheDir, "pulls"),
    fetch: async (url) => {
      const urlString = String(url);
      prFetchUrls.push(urlString);
      if (urlString.includes("/repos/owner/repo/pulls?")) {
        return jsonResponse([
          {
            number: 5,
            title: "Move billing to event callbacks",
            body: "Fixes #42 and records the billing decision.",
            merged_at: "2026-03-01T00:00:00Z",
            html_url: "https://github.com/owner/repo/pull/5",
            labels: [{ name: "architecture" }],
            changed_files: 0,
            comments: 1,
            review_comments: 2,
          },
          {
            number: 6,
            title: "Closed but not merged",
            body: "",
            merged_at: null,
            html_url: "https://github.com/owner/repo/pull/6",
            labels: [],
            changed_files: 0,
            comments: 0,
            review_comments: 0,
          },
        ]);
      }
      if (urlString.endsWith("/repos/owner/repo/pulls/5")) {
        return jsonResponse({
          number: 5,
          title: "Move billing to event callbacks",
          body: "Fixes #42 and records the billing decision.",
          merged_at: "2026-03-01T00:00:00Z",
          html_url: "https://github.com/owner/repo/pull/5",
          labels: [{ name: "architecture" }],
          changed_files: 2,
          comments: 1,
          review_comments: 2,
          commits: 2,
        });
      }
      if (urlString.includes("/repos/owner/repo/pulls/5/comments?")) {
        return jsonResponse([
          {
            body: "Keep this in the webhook boundary so checkout retries remain isolated.",
            path: "apps/web/lib/billing/lemon-squeezy.ts",
            commit_id: "abc123",
            html_url: "https://github.com/owner/repo/pull/5#discussion_r1",
            created_at: "2026-02-28T00:00:00Z",
            user: { login: "reviewer" },
          },
          {
            body: "Add source validation around the generated billing summary.",
            path: "packages/pipeline/src/agents/history.ts",
            commit_id: "def456",
            html_url: "https://github.com/owner/repo/pull/5#discussion_r2",
            created_at: "2026-02-28T00:10:00Z",
            user: { login: "architect" },
          },
        ]);
      }
      if (urlString.includes("/repos/owner/repo/issues/5/comments?")) {
        return jsonResponse([
          {
            body: "This replaces polling because provider webhooks carry the canonical plan event.",
            html_url: "https://github.com/owner/repo/pull/5#issuecomment-1",
            created_at: "2026-02-27T00:00:00Z",
            user: { login: "maintainer" },
          },
        ]);
      }
      if (urlString.includes("/repos/owner/repo/pulls/5/commits?")) {
        return jsonResponse([{ sha: "abc123" }, { sha: "def456" }]);
      }
      if (urlString.includes("/repos/owner/repo/pulls/5/files?")) {
        return jsonResponse([
          { filename: "apps/web/lib/billing/lemon-squeezy.ts" },
          { filename: "apps/web/app/api/billing/webhook/route.ts" },
        ]);
      }
      throw new Error(`unexpected PR fetch ${urlString}`);
    },
  });
  const pulls = await pullClient.getMergedPullRequests("owner", "repo", 10);
  assert.equal(pulls.length, 1);
  assert.equal(pulls[0]?.number, 5);
  assert.deepEqual(pulls[0]?.linkedIssueNumbers, [42]);
  assert.deepEqual(pulls[0]?.commitShas, ["abc123", "def456"]);
  assert.deepEqual(pulls[0]?.changedFilePaths, [
    "apps/web/lib/billing/lemon-squeezy.ts",
    "apps/web/app/api/billing/webhook/route.ts",
  ]);
  assert.equal(pulls[0]?.iterationCount, 2);
  assert.equal(pulls[0]?.reviewCommentDetails?.length, 2);
  assert.equal(pulls[0]?.reviewCommentDetails?.[0]?.path, "apps/web/lib/billing/lemon-squeezy.ts");
  assert.equal(pulls[0]?.reviewCommentDetails?.[0]?.commitSha, "abc123");
  assert.equal(pulls[0]?.reviewCommentDetails?.[0]?.author, "reviewer");
  assert.equal(pulls[0]?.discussionComments?.[0]?.author, "maintainer");
  assert.ok(prFetchUrls.some((url) => url.includes("/pulls/5/comments?")));
  assert.ok(prFetchUrls.some((url) => url.includes("/pulls/5/commits?")));
  assert.ok(prFetchUrls.some((url) => url.includes("/pulls/5/files?")));
} finally {
  await rm(cacheDir, { recursive: true, force: true });
}

process.stdout.write("github client tests passed\n");

function jsonResponse(value: unknown, rateLimit?: { remaining: string; reset: string }) {
  const headers = new Headers({ "content-type": "application/json" });
  if (rateLimit) {
    headers.set("x-ratelimit-remaining", rateLimit.remaining);
    headers.set("x-ratelimit-reset", rateLimit.reset);
  }
  return new Response(JSON.stringify(value), { status: 200, headers });
}

function headerValue(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get(name);
  if (Array.isArray(headers)) return new Headers(headers).get(name);
  return headers[name] || headers[name.toLowerCase()] || null;
}
