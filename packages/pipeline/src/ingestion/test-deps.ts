import assert from "node:assert/strict";
import type { GitHubTreeFile } from "@codebrief/shared";
import { analyzeDependencies } from "./deps.js";
import type { GitHubApiClient } from "./github-client.js";

const blobs = new Map<string, string>([
  [
    "package-sha",
    JSON.stringify({
      dependencies: {
        "left-pad": "^1.3.0",
        unpinned: "*",
      },
      devDependencies: {
        vite: "~5.0.1",
      },
    }),
  ],
  ["requirements-sha", "django==4.2.1\nrequests>=2.31.0\n# ignored"],
  ["go-sha", "module example.com/app\n\nrequire github.com/gin-gonic/gin v1.9.1\n"],
  ["gemfile-sha", "source \"https://rubygems.org\"\ngem \"rails\", \"6.1.0\"\ngem \"debug\"\n"],
]);

const client = {
  async getBlobText(_: string, __: string, sha: string) {
    const value = blobs.get(sha);
    if (!value) throw new Error(`missing blob ${sha}`);
    return value;
  },
  async getLatestCommit(owner: string, repo: string) {
    const key = `${owner}/${repo}`;
    const commits = new Map<string, { date: string; htmlUrl: string }>([
      ["left-pad/left-pad", { date: "2022-01-01T00:00:00Z", htmlUrl: "https://github.com/left-pad/left-pad/commit/old" }],
      ["vitejs/vite", { date: "2026-06-01T00:00:00Z", htmlUrl: "https://github.com/vitejs/vite/commit/new" }],
      ["django/django", { date: "2026-05-01T00:00:00Z", htmlUrl: "https://github.com/django/django/commit/new" }],
      ["gin-gonic/gin", { date: "2026-05-20T00:00:00Z", htmlUrl: "https://github.com/gin-gonic/gin/commit/new" }],
      ["rails/rails", { date: "2020-01-01T00:00:00Z", htmlUrl: "https://github.com/rails/rails/commit/old" }],
    ]);
    const commit = commits.get(key);
    if (!commit) throw new Error(`missing latest commit ${key}`);
    return commit;
  },
} as GitHubApiClient;

const treeFiles: GitHubTreeFile[] = [
  { path: "package.json", type: "blob", mode: "100644", sha: "package-sha", size: 100, url: "" },
  { path: "requirements.txt", type: "blob", mode: "100644", sha: "requirements-sha", size: 100, url: "" },
  { path: "go.mod", type: "blob", mode: "100644", sha: "go-sha", size: 100, url: "" },
  { path: "Gemfile", type: "blob", mode: "100644", sha: "gemfile-sha", size: 100, url: "" },
];

const osvRequests: unknown[] = [];
const registryRequests: string[] = [];
const findings = await analyzeDependencies(client, "owner", "repo", treeFiles, {
  now: new Date("2026-06-12T00:00:00Z"),
  fetch: async (url, init) => {
    const urlString = String(url);
    if (urlString.startsWith("https://registry.npmjs.org/")) {
      registryRequests.push(urlString);
      const packageName = decodeURIComponent(urlString.replace("https://registry.npmjs.org/", ""));
      return new Response(
        JSON.stringify({
          "dist-tags": {
            latest: packageName === "left-pad" ? "4.0.0" : packageName === "vite" ? "5.1.0" : "1.0.0",
          },
          repository:
            packageName === "left-pad"
              ? { url: "git+https://github.com/left-pad/left-pad.git" }
              : packageName === "vite"
                ? { url: "git+https://github.com/vitejs/vite.git" }
                : undefined,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (urlString.startsWith("https://pypi.org/pypi/")) {
      registryRequests.push(urlString);
      const packageName = decodeURIComponent(urlString.replace("https://pypi.org/pypi/", "").replace(/\/json$/, ""));
      return new Response(
        JSON.stringify({
          info: {
            version: packageName === "django" ? "5.0.0" : "2.32.0",
            project_urls:
              packageName === "django"
                ? {
                    Source: "https://github.com/django/django",
                  }
                : {
                    Homepage: "https://requests.readthedocs.io/",
                  },
            home_page: packageName === "django" ? undefined : "https://requests.readthedocs.io/",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (urlString.startsWith("https://rubygems.org/api/v1/gems/")) {
      registryRequests.push(urlString);
      const packageName = decodeURIComponent(urlString.replace("https://rubygems.org/api/v1/gems/", "").replace(/\.json$/, ""));
      return new Response(
        JSON.stringify({
          version: packageName === "rails" ? "9.0.0" : "1.9.0",
          source_code_uri: packageName === "rails" ? "https://github.com/rails/rails" : "",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    assert.equal(urlString, "https://api.osv.dev/v1/querybatch");
    osvRequests.push(JSON.parse(String(init?.body || "{}")));
    return new Response(
      JSON.stringify({
        results: [
          { vulns: [{ id: "GHSA-leftpad", summary: "left-pad vulnerable", database_specific: { severity: "HIGH" } }] },
          { vulns: [] },
          { vulns: [{ id: "PYSEC-django", summary: "django vulnerable", aliases: ["CVE-0000-0001"] }] },
          { vulns: [] },
          { vulns: [] },
          { vulns: [{ id: "GHSA-rails", summary: "rails vulnerable", database_specific: { severity: "CRITICAL" } }] },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  },
});

assert.deepEqual(registryRequests.sort(), [
  "https://pypi.org/pypi/django/json",
  "https://pypi.org/pypi/requests/json",
  "https://registry.npmjs.org/left-pad",
  "https://registry.npmjs.org/unpinned",
  "https://registry.npmjs.org/vite",
  "https://rubygems.org/api/v1/gems/debug.json",
  "https://rubygems.org/api/v1/gems/rails.json",
]);
assert.equal(osvRequests.length, 1);
assert.deepEqual(osvRequests[0], {
  queries: [
    { package: { name: "left-pad", ecosystem: "npm" }, version: "1.3.0" },
    { package: { name: "vite", ecosystem: "npm" }, version: "5.0.1" },
    { package: { name: "django", ecosystem: "PyPI" }, version: "4.2.1" },
    { package: { name: "requests", ecosystem: "PyPI" }, version: "2.31.0" },
    { package: { name: "github.com/gin-gonic/gin", ecosystem: "Go" }, version: "1.9.1" },
    { package: { name: "rails", ecosystem: "RubyGems" }, version: "6.1.0" },
  ],
});

const leftPad = findings.find((finding) => finding.name === "left-pad");
assert.ok(leftPad);
assert.equal(leftPad.vulnerabilities.length, 1);
assert.equal(leftPad.latestVersion, "4.0.0");
assert.equal(leftPad.majorVersionsBehind, 3);
assert.equal(leftPad.repositoryUrl, "https://github.com/left-pad/left-pad");
assert.equal(leftPad.abandonmentStatus, "checked");
assert.equal(leftPad.repositoryLastCommitAt, "2022-01-01T00:00:00Z");
assert.ok((leftPad.monthsSinceRepositoryCommit || 0) >= 24);
assert.ok(leftPad.flags.includes("vulnerable"));
assert.ok(leftPad.flags.includes("osv:GHSA-leftpad"));
assert.ok(leftPad.flags.includes("severity:HIGH"));
assert.ok(leftPad.flags.includes("outdated"));
assert.ok(leftPad.flags.includes("outdated-major:3"));
assert.ok(leftPad.flags.includes("abandoned"));
assert.ok(leftPad.flags.some((flag) => flag.startsWith("abandoned-months:")));
assert.equal(leftPad.vulnerabilities[0]?.source.url, "https://osv.dev/vulnerability/GHSA-leftpad");

const unpinned = findings.find((finding) => finding.name === "unpinned");
assert.ok(unpinned);
assert.equal(unpinned.vulnerabilities.length, 0);
assert.equal(unpinned.latestVersion, "1.0.0");
assert.equal(unpinned.abandonmentStatus, "repository-missing");
assert.deepEqual(unpinned.flags, []);

const django = findings.find((finding) => finding.name === "django");
assert.ok(django);
assert.equal(django.vulnerabilities[0]?.aliases[0], "CVE-0000-0001");
assert.equal(django.repositoryUrl, "https://github.com/django/django");
assert.equal(django.abandonmentStatus, "checked");

const requests = findings.find((finding) => finding.name === "requests");
assert.ok(requests);
assert.equal(requests.abandonmentStatus, "repository-unsupported");

const gin = findings.find((finding) => finding.name === "github.com/gin-gonic/gin");
assert.ok(gin);
assert.equal(gin.repositoryUrl, "https://github.com/gin-gonic/gin");
assert.equal(gin.abandonmentStatus, "checked");
assert.ok(!gin.flags.includes("abandoned"));

const rails = findings.find((finding) => finding.name === "rails");
assert.ok(rails);
assert.equal(rails.manager, "ruby");
assert.equal(rails.latestVersion, "9.0.0");
assert.equal(rails.majorVersionsBehind, 3);
assert.equal(rails.repositoryUrl, "https://github.com/rails/rails");
assert.equal(rails.abandonmentStatus, "checked");
assert.ok(rails.flags.includes("outdated-major:3"));
assert.ok(rails.flags.includes("severity:CRITICAL"));
assert.ok(rails.flags.includes("abandoned"));

const debug = findings.find((finding) => finding.name === "debug");
assert.ok(debug);
assert.equal(debug.manager, "ruby");
assert.equal(debug.version, "unpinned");
assert.equal(debug.latestVersion, "1.9.0");
assert.equal(debug.abandonmentStatus, "repository-missing");

// OSV outage is best-effort: the analysis still returns deps, just without vuln data.
const osvDown = await analyzeDependencies(client, "owner", "repo", treeFiles.slice(0, 1), {
  fetch: async (url) => {
    if (String(url).startsWith("https://registry.npmjs.org/")) {
      return new Response(JSON.stringify({ "dist-tags": { latest: "1.3.0" } }), { status: 200 });
    }
    return new Response("upstream unavailable", { status: 503 });
  },
});
const osvLeftPad = osvDown.find((finding) => finding.name === "left-pad");
assert.ok(osvLeftPad);
assert.equal(osvLeftPad.vulnerabilities.length, 0);
assert.ok(!osvLeftPad.flags.includes("vulnerable"));
assert.equal(osvLeftPad.latestVersion, "1.3.0");

// A registry outage is non-fatal: the dependency is recorded and flagged, not thrown.
const registryDown = await analyzeDependencies(client, "owner", "repo", treeFiles.slice(0, 1), {
  fetch: async (url) => {
    if (String(url).startsWith("https://registry.npmjs.org/")) {
      return new Response("registry unavailable", { status: 503 });
    }
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  },
});
const downLeftPad = registryDown.find((finding) => finding.name === "left-pad");
assert.ok(downLeftPad);
assert.equal(downLeftPad.latestVersion, undefined);
assert.ok(downLeftPad.flags.includes("registry-lookup-failed"));

// Regression: a monorepo workspace package ("@workspace/ui": "workspace:*") plus an
// unpublished package with a real version (404 on the registry) must not fail the
// run — this is exactly what crashed the first live corpus pass on shadcn-ui/ui.
const workspaceTree: GitHubTreeFile[] = [{ path: "package.json", type: "blob", mode: "100644", sha: "workspace-pkg", size: 100, url: "" }];
const workspaceClient = {
  async getBlobText(_: string, __: string, sha: string) {
    if (sha !== "workspace-pkg") throw new Error(`missing blob ${sha}`);
    return JSON.stringify({ dependencies: { "@workspace/ui": "workspace:*", "@private/lib": "1.0.0", react: "18.0.0" } });
  },
  async getLatestCommit() {
    throw new Error("getLatestCommit should not be called when no repo URL is known");
  },
} as unknown as GitHubApiClient;
const workspaceRegistryRequests: string[] = [];
const workspaceFindings = await analyzeDependencies(workspaceClient, "owner", "repo", workspaceTree, {
  fetch: async (url) => {
    const urlString = String(url);
    if (urlString.startsWith("https://registry.npmjs.org/")) {
      workspaceRegistryRequests.push(urlString);
      if (urlString.endsWith("/react")) return new Response(JSON.stringify({ "dist-tags": { latest: "18.3.0" } }), { status: 200 });
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    return new Response(JSON.stringify({ results: [{ vulns: [] }, { vulns: [] }] }), { status: 200 });
  },
});
// The workspace: specifier is skipped entirely — no registry request is made for it.
assert.ok(!workspaceRegistryRequests.some((requestUrl) => requestUrl.includes("@workspace")));
const wsUi = workspaceFindings.find((finding) => finding.name === "@workspace/ui");
assert.ok(wsUi);
assert.equal(wsUi.latestVersion, undefined);
// The unpublished package 404s but is recorded and flagged rather than fatal.
const priv = workspaceFindings.find((finding) => finding.name === "@private/lib");
assert.ok(priv);
assert.equal(priv.latestVersion, undefined);
assert.ok(priv.flags.includes("registry-lookup-failed"));
// A normal published package still resolves.
const react = workspaceFindings.find((finding) => finding.name === "react");
assert.ok(react);
assert.equal(react.latestVersion, "18.3.0");

process.stdout.write("dependency analysis tests passed\n");
