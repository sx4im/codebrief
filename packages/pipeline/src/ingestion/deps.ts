import type { GitHubTreeFile, SourceCitation } from "@codebrief/shared";
import { GitHubApiClient } from "./github-client.js";

type DependencyManager = "npm" | "python" | "go" | "ruby" | "unknown";
type AbandonmentStatus = "checked" | "repository-missing" | "repository-unsupported" | "lookup-failed" | "not-checked";

interface OsvVulnerability {
  id: string;
  summary: string;
  severity?: string;
  aliases: string[];
  source: SourceCitation;
}

export interface DependencyFinding {
  manager: DependencyManager;
  name: string;
  version: string;
  latestVersion?: string;
  majorVersionsBehind?: number;
  repositoryUrl?: string;
  repositoryLastCommitAt?: string;
  repositoryLastCommitUrl?: string;
  monthsSinceRepositoryCommit?: number;
  abandonmentStatus?: AbandonmentStatus;
  abandonmentReason?: string;
  source: SourceCitation;
  flags: string[];
  vulnerabilities: OsvVulnerability[];
}

export interface DependencyAnalysisOptions {
  fetch?: typeof fetch;
  now?: Date;
  osvQueryLimit?: number;
  abandonmentCheckLimit?: number;
}

export async function analyzeDependencies(
  client: GitHubApiClient,
  owner: string,
  repo: string,
  treeFiles: GitHubTreeFile[],
  options: DependencyAnalysisOptions = {},
): Promise<DependencyFinding[]> {
  const findings: DependencyFinding[] = [];
  for (const file of treeFiles.filter((candidate) => isManifest(candidate.path))) {
    const text = await client.getBlobText(owner, repo, file.sha);
    findings.push(...parseManifest(file.path, text));
  }
  const withRegistryMetadata = await enrichWithRegistryMetadata(findings, options);
  const withAbandonment = await enrichWithAbandonment(client, withRegistryMetadata, options);
  return enrichWithOsv(withAbandonment, options);
}

function isManifest(path: string): boolean {
  return ["package.json", "requirements.txt", "go.mod", "Gemfile"].some((name) => path.endsWith(name));
}

function parseManifest(path: string, text: string): DependencyFinding[] {
  if (path.endsWith("package.json")) {
    const parsed = JSON.parse(text) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return Object.entries({ ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) }).map(([name, version]) => ({
      manager: "npm",
      name,
      version,
      source: { type: "file", path },
      flags: [],
      vulnerabilities: [],
    }));
  }
  if (path.endsWith("requirements.txt")) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const [name, version = "unpinned"] = line.split(/==|>=|<=|~=|>|</);
        return { manager: "python" as const, name: name || line, version, source: { type: "file" as const, path }, flags: [], vulnerabilities: [] };
      });
  }
  if (path.endsWith("go.mod")) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .map((line) => line.replace(/^require\s+/, "").trim())
      .filter((line) => /^[\w./-]+\s+v/.test(line))
      .map((line) => {
        const [name = line, version = "unknown"] = line.split(/\s+/);
        return { manager: "go" as const, name, version, source: { type: "file" as const, path }, flags: [], vulnerabilities: [] };
      });
  }
  if (path.endsWith("Gemfile")) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .flatMap((line) => {
        const match = line.match(/^gem\s+["']([^"']+)["']\s*(?:,\s*["']([^"']+)["'])?/);
        if (!match?.[1]) return [];
        return [
          {
            manager: "ruby" as const,
            name: match[1],
            version: match[2] || "unpinned",
            source: { type: "file" as const, path },
            flags: [],
            vulnerabilities: [],
          },
        ];
      });
  }
  return [];
}

async function enrichWithOsv(findings: DependencyFinding[], options: DependencyAnalysisOptions): Promise<DependencyFinding[]> {
  const fetchImpl = options.fetch || fetch;
  const queries = findings
    .map((finding, index) => ({ finding, index, query: osvQueryForFinding(finding) }))
    .filter((item): item is { finding: DependencyFinding; index: number; query: OsvQuery } => Boolean(item.query))
    .slice(0, options.osvQueryLimit ?? 200);
  if (queries.length === 0) return findings;

  let body: OsvBatchResponse;
  try {
    const response = await fetchImpl("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queries: queries.map((item) => item.query) }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${await response.text()}`);
    }
    body = (await response.json()) as OsvBatchResponse;
  } catch (error) {
    // Vulnerability enrichment is best-effort: a transient OSV outage must not
    // fail the analysis. Return findings without vulnerability data.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[deps] OSV vulnerability query skipped: ${message}\n`);
    return findings;
  }
  const results = body.results || [];
  const byIndex = new Map(queries.map((item, position) => [position, item.index]));

  return findings.map((finding, index) => {
    const queryPosition = [...byIndex.entries()].find(([, findingIndex]) => findingIndex === index)?.[0];
    if (queryPosition === undefined) return finding;
    const vulnerabilities = (results[queryPosition]?.vulns || []).map(osvVulnerabilityToFinding);
    if (vulnerabilities.length === 0) return finding;
    const severityFlags = new Set(vulnerabilities.map((vulnerability) => vulnerability.severity).filter(Boolean));
    return {
      ...finding,
      vulnerabilities,
      flags: [
        ...finding.flags,
        "vulnerable",
        ...vulnerabilities.map((vulnerability) => `osv:${vulnerability.id}`),
        ...[...severityFlags].map((severity) => `severity:${severity}`),
      ],
    };
  });
}

interface DependencyRegistryMetadata {
  latestVersion: string;
  repositoryUrl?: string;
}

async function enrichWithRegistryMetadata(findings: DependencyFinding[], options: DependencyAnalysisOptions): Promise<DependencyFinding[]> {
  const fetchImpl = options.fetch || fetch;
  const metadataByKey = new Map<string, DependencyRegistryMetadata | null>();
  const output: DependencyFinding[] = [];

  for (const finding of findings) {
    const ecosystem = ecosystemForManager(finding.manager);
    const current = normalizeExactVersion(finding.version);
    // Skip registry lookups for ecosystems without a public version API (Go) and
    // for local/workspace/git specifiers that are not published anywhere.
    if ((ecosystem !== "npm" && ecosystem !== "PyPI" && ecosystem !== "RubyGems") || isLocalVersionSpecifier(finding.version)) {
      output.push({ ...finding, repositoryUrl: repositoryUrlForFinding(finding) });
      continue;
    }

    const key = `${ecosystem}:${finding.name}`;
    if (!metadataByKey.has(key)) {
      metadataByKey.set(key, await fetchRegistryMetadataSafe(fetchImpl, finding.manager, finding.name));
    }
    const metadata = metadataByKey.get(key) ?? null;

    if (!metadata) {
      // Private, unpublished, or registry-missing package (e.g. a monorepo
      // workspace package). Record the finding without latest-version enrichment
      // rather than failing the entire analysis on one un-lookupable dependency.
      output.push({ ...finding, repositoryUrl: repositoryUrlForFinding(finding), flags: [...finding.flags, "registry-lookup-failed"] });
      continue;
    }

    const normalizedRepositoryUrl = normalizeRepositoryUrl(metadata.repositoryUrl);
    const majorVersionsBehind = current ? majorVersionDelta(current, metadata.latestVersion) : undefined;
    output.push({
      ...finding,
      latestVersion: metadata.latestVersion,
      majorVersionsBehind,
      repositoryUrl: normalizedRepositoryUrl,
      flags:
        majorVersionsBehind !== undefined && majorVersionsBehind > 2
          ? [...finding.flags, "outdated", `outdated-major:${majorVersionsBehind}`, `latest:${metadata.latestVersion}`]
          : finding.flags,
    });
  }

  return output;
}

// A dependency latest-version lookup is best-effort enrichment; a single
// unresolvable package (404, private, network blip) must never fail the run.
async function fetchRegistryMetadataSafe(
  fetchImpl: typeof fetch,
  manager: DependencyManager,
  name: string,
): Promise<DependencyRegistryMetadata | null> {
  try {
    return await fetchRegistryMetadata(fetchImpl, manager, name);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[deps] registry lookup skipped for ${name}: ${message}\n`);
    return null;
  }
}

function isLocalVersionSpecifier(version: string): boolean {
  return /^(workspace:|file:|link:|portal:|git\+|git:|github:|https?:|catalog:)/i.test(version.trim());
}

async function fetchRegistryMetadata(fetchImpl: typeof fetch, manager: DependencyManager, name: string): Promise<DependencyRegistryMetadata> {
  const url =
    manager === "npm"
      ? `https://registry.npmjs.org/${encodeURIComponent(name)}`
      : manager === "python"
        ? `https://pypi.org/pypi/${encodeURIComponent(name)}/json`
        : manager === "ruby"
          ? `https://rubygems.org/api/v1/gems/${encodeURIComponent(name)}.json`
          : null;
  if (!url) throw new Error(`Latest-version lookup is unsupported for ${manager}`);

  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Dependency latest-version lookup failed for ${name}: HTTP ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as RegistryMetadataResponse;
  const latest = manager === "npm" ? body["dist-tags"]?.latest : manager === "python" ? body.info?.version : body.version;
  if (!latest) throw new Error(`Dependency latest-version lookup failed for ${name}: missing latest version`);
  return {
    latestVersion: latest,
    repositoryUrl: repositoryUrlFromRegistryBody(manager, body),
  };
}

async function enrichWithAbandonment(
  client: GitHubApiClient,
  findings: DependencyFinding[],
  options: DependencyAnalysisOptions,
): Promise<DependencyFinding[]> {
  const now = options.now || new Date();
  const limit = options.abandonmentCheckLimit ?? 100;
  const latestCommitByRepo = new Map<string, Promise<{ date: string; htmlUrl: string }>>();
  let checked = 0;

  const output: DependencyFinding[] = [];
  for (const finding of findings) {
    const repositoryUrl = finding.repositoryUrl || repositoryUrlForFinding(finding);
    if (!repositoryUrl) {
      output.push({
        ...finding,
        abandonmentStatus: "repository-missing",
        abandonmentReason: "No upstream repository URL was available from the package metadata.",
      });
      continue;
    }

    const githubRepo = githubRepoFromUrl(repositoryUrl);
    if (!githubRepo) {
      output.push({
        ...finding,
        repositoryUrl,
        abandonmentStatus: "repository-unsupported",
        abandonmentReason: "Abandonment checks only support GitHub repository URLs in v1.",
      });
      continue;
    }

    if (checked >= limit) {
      output.push({
        ...finding,
        repositoryUrl,
        abandonmentStatus: "not-checked",
        abandonmentReason: `Abandonment check limit ${limit} reached.`,
      });
      continue;
    }
    checked += 1;

    const key = `${githubRepo.owner}/${githubRepo.repo}`;
    let latestCommit = latestCommitByRepo.get(key);
    if (!latestCommit) {
      latestCommit = client.getLatestCommit(githubRepo.owner, githubRepo.repo);
      latestCommitByRepo.set(key, latestCommit);
    }

    try {
      const commit = await latestCommit;
      const monthsSinceRepositoryCommit = monthsBetween(commit.date, now);
      output.push({
        ...finding,
        repositoryUrl,
        repositoryLastCommitAt: commit.date,
        repositoryLastCommitUrl: commit.htmlUrl,
        monthsSinceRepositoryCommit,
        abandonmentStatus: "checked",
        flags:
          monthsSinceRepositoryCommit >= 24
            ? [...finding.flags, "abandoned", `abandoned-months:${monthsSinceRepositoryCommit}`, `last-commit:${commit.date.slice(0, 10)}`]
            : finding.flags,
      });
    } catch (error) {
      output.push({
        ...finding,
        repositoryUrl,
        abandonmentStatus: "lookup-failed",
        abandonmentReason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return output;
}

interface RegistryMetadataResponse {
  "dist-tags"?: { latest?: string };
  repository?: string | { url?: string };
  homepage?: string;
  info?: {
    version?: string;
    home_page?: string;
    project_urls?: Record<string, string>;
  };
  source_code_uri?: string;
  homepage_uri?: string;
  project_uri?: string;
  version?: string;
}

function repositoryUrlFromRegistryBody(manager: DependencyManager, body: RegistryMetadataResponse): string | undefined {
  if (manager === "npm") {
    return repositoryValue(body.repository) || body.homepage;
  }
  if (manager === "python") {
    return selectProjectUrl(body.info?.project_urls) || body.info?.home_page;
  }
  if (manager === "ruby") {
    return body.source_code_uri || body.homepage_uri || body.project_uri;
  }
  return undefined;
}

function repositoryValue(repository: RegistryMetadataResponse["repository"]): string | undefined {
  if (!repository) return undefined;
  if (typeof repository === "string") return repository;
  return repository.url;
}

function selectProjectUrl(projectUrls: Record<string, string> | undefined): string | undefined {
  if (!projectUrls) return undefined;
  const entries = Object.entries(projectUrls);
  const preferredLabels = ["source", "source code", "repository", "repo", "code", "github"];
  for (const label of preferredLabels) {
    const match = entries.find(([key]) => key.toLowerCase() === label || key.toLowerCase().includes(label));
    if (match?.[1]) return match[1];
  }
  return entries.find(([, url]) => url.includes("github.com"))?.[1];
}

function repositoryUrlForFinding(finding: DependencyFinding): string | undefined {
  if (finding.manager !== "go") return undefined;
  const match = finding.name.match(/^github\.com\/([^/\s]+)\/([^/\s]+)/);
  return match?.[1] && match[2] ? `https://github.com/${match[1]}/${match[2]}` : undefined;
}

function normalizeRepositoryUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  const withoutPrefix = trimmed
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/")
    .replace(/^git@github\.com:/, "https://github.com/");
  const match = withoutPrefix.match(/github\.com[:/]([^/\s#?]+)\/([^/\s#?]+)(?:[/#?]|$)/i);
  if (!match?.[1] || !match[2]) return withoutPrefix;
  return `https://github.com/${match[1]}/${match[2].replace(/\.git$/, "")}`;
}

function githubRepoFromUrl(url: string): { owner: string; repo: string } | null {
  const normalized = normalizeRepositoryUrl(url);
  const match = normalized?.match(/^https:\/\/github\.com\/([^/\s#?]+)\/([^/\s#?]+)$/i);
  if (!match?.[1] || !match[2]) return null;
  return { owner: match[1], repo: match[2] };
}

function monthsBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso);
  if (!Number.isFinite(from.getTime())) return 0;
  const days = Math.max(0, (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  return Math.floor(days / 30);
}

interface OsvQuery {
  package: {
    name: string;
    ecosystem: string;
  };
  version: string;
}

interface OsvBatchResponse {
  results?: Array<{
    vulns?: OsvVuln[];
  }>;
}

interface OsvVuln {
  id?: string;
  summary?: string;
  aliases?: string[];
  severity?: Array<{ type?: string; score?: string }>;
  database_specific?: { severity?: string };
}

function osvQueryForFinding(finding: DependencyFinding): OsvQuery | null {
  const ecosystem = ecosystemForManager(finding.manager);
  const version = normalizeExactVersion(finding.version);
  if (!ecosystem || !version) return null;
  return {
    package: { name: finding.name, ecosystem },
    version,
  };
}

function ecosystemForManager(manager: DependencyManager): string | null {
  if (manager === "npm") return "npm";
  if (manager === "python") return "PyPI";
  if (manager === "go") return "Go";
  if (manager === "ruby") return "RubyGems";
  return null;
}

function normalizeExactVersion(version: string): string | null {
  const trimmed = version.trim();
  if (!trimmed || trimmed === "unknown" || trimmed === "unpinned" || trimmed === "*" || trimmed.toLowerCase() === "latest") return null;
  const exact = trimmed.match(/(?:npm:)?v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/)?.[1];
  if (exact) return exact;
  const goVersion = trimmed.match(/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)?.[0];
  return goVersion || null;
}

function majorVersionDelta(current: string, latest: string): number {
  const currentMajor = Number.parseInt(current.replace(/^v/, "").split(".")[0] || "0", 10);
  const latestMajor = Number.parseInt(latest.replace(/^v/, "").split(".")[0] || "0", 10);
  if (!Number.isFinite(currentMajor) || !Number.isFinite(latestMajor)) return 0;
  return Math.max(0, latestMajor - currentMajor);
}

function osvVulnerabilityToFinding(vulnerability: OsvVuln): OsvVulnerability {
  const id = vulnerability.id || "unknown";
  const severity = vulnerability.database_specific?.severity || vulnerability.severity?.[0]?.score || vulnerability.severity?.[0]?.type;
  return {
    id,
    summary: vulnerability.summary || id,
    severity,
    aliases: vulnerability.aliases || [],
    source: {
      type: "dependency",
      url: id === "unknown" ? undefined : `https://osv.dev/vulnerability/${encodeURIComponent(id)}`,
      excerpt: vulnerability.summary || id,
    },
  };
}
