import { randomUUID } from "node:crypto";
import type OpenAI from "openai";
import {
  AnalysisConfigSchema,
  BriefOutputSchema,
  PIPELINE_STAGES,
  type AnalysisJobPayload,
  type BriefOutput,
  type CommitSummary,
  type GitHubRepoRef,
  type GitHubTreeFile,
  type StageEvent,
} from "@codebrief/shared";
import type { GitHubApiClient } from "../ingestion/github-client.js";
import type { ArtifactStore } from "../storage/r2-client.js";
import type { AnalysisJobStore } from "../storage/postgres-job-store.js";
import type { ProgressEmitter } from "../websocket/emit.js";
import { loadPipelineEnv } from "../env.js";
import { runAnalysisJob } from "./analysis.job.js";

// Offline end-to-end exercise of the full pipeline wiring with injected fake
// GitHub + NVIDIA clients. Ingestion, all static analysis (risk/coupling/silos/
// complexity/recency/tech-stack/repo-stats), the four agents (callAgent + source
// validation + token accounting), diagram building, and brief assembly all run on
// real code over deterministic fake-repo data — no live services. This is the
// closest credential-free analog to the M1 gate and catches cross-stage wiring
// regressions that unit tests miss.

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const TREE: Array<{ path: string; sha: string; content: string }> = [
  {
    path: "core/index.ts",
    sha: "sha-core",
    content: 'import { serve } from "../server/app";\nimport { query } from "../db/client";\nexport function main() { return serve() + query().length; }\n',
  },
  {
    path: "server/app.ts",
    sha: "sha-server",
    content: 'import { query } from "../db/client";\nexport function serve() { if (query().length > 0) { return 1; } return 0; }\n',
  },
  {
    path: "db/client.ts",
    sha: "sha-db",
    content: "export function query() { return [1, 2, 3]; }\n",
  },
  { path: "README.md", sha: "sha-readme", content: "# Widget\nA test project used for the offline pipeline integration test.\n" },
];

const CONTENT_BY_SHA = new Map(TREE.map((file) => [file.sha, file.content]));

const treeFiles: GitHubTreeFile[] = TREE.map((file) => ({
  path: file.path,
  mode: "100644",
  type: "blob",
  sha: file.sha,
  url: `https://example.com/${file.path}`,
}));

const commits: CommitSummary[] = [
  { sha: "c1", message: "init", authorName: "alice", date: "2026-05-01T00:00:00Z", htmlUrl: "https://example.com/c1", files: ["core/index.ts", "db/client.ts"] },
  { sha: "c2", message: "server", authorName: "alice", date: "2026-05-20T00:00:00Z", htmlUrl: "https://example.com/c2", files: ["server/app.ts", "db/client.ts"] },
  { sha: "c3", message: "tweak", authorName: "bob", date: "2026-06-01T00:00:00Z", htmlUrl: "https://example.com/c3", files: ["core/index.ts"] },
];

const repo: GitHubRepoRef = {
  owner: "acme",
  name: "widget",
  fullName: "acme/widget",
  defaultBranch: "main",
  htmlUrl: "https://github.com/acme/widget",
  isPrivate: false,
  createdAt: "2025-06-01T00:00:00Z",
  pushedAt: "2026-06-01T00:00:00Z",
};

const fakeGithub = {
  async getRepo() {
    return repo;
  },
  async getReadme() {
    return "# Widget\nA test project.";
  },
  async getTree() {
    return treeFiles;
  },
  async getCommits() {
    return commits;
  },
  async getMergedPullRequests() {
    return [];
  },
  async getRecentIssues() {
    return [];
  },
  async getBlobText(_owner: string, _repo: string, sha: string) {
    return CONTENT_BY_SHA.get(sha) ?? "";
  },
} as unknown as GitHubApiClient;

const readmeSource = { type: "readme" as const, path: "README.md" };

function architectureOutput() {
  const claim = (text: string) => ({ claim: text, sources: [readmeSource], confidence: 0.8 });
  return {
    purpose: claim("Widget is a small service composed of core, server, and db modules."),
    mainWorkflows: [{ name: "Request handling", claim: "The server module handles requests.", sources: [{ type: "file", path: "server/app.ts" }], confidence: 0.8 }],
    dataModel: claim("Data access is centralized in the db module."),
    integrations: [{ name: "Datastore", kind: "database" as const, claim: "The db module is the data layer.", sources: [{ type: "file", path: "db/client.ts" }], confidence: 0.8 }],
    architecturePattern: { claim: "Layered modules inferred from structure.", sources: [{ type: "inferred", excerpt: "inferred from module structure" }], confidence: 0.7 },
    claims: [claim("Core orchestrates the system."), claim("Server depends on db."), claim("The project is intentionally small.")],
    confidence: 0.82,
    flaggedClaims: [],
  };
}

function historyOutput() {
  return {
    decisions: [
      {
        title: "Centralize data access in db module",
        description: "All queries go through db/client.ts.",
        context: "Reduce duplicated data-access logic.",
        evidence: [{ type: "file", path: "db/client.ts" }],
        assessment: "Sound; keeps the data layer cohesive.",
        confidence: 0.7,
      },
    ],
  };
}

function riskOutput() {
  const landmine = (location: string, category: string, severity: string, priority: number) => ({
    location,
    category,
    severity,
    evidence: [{ type: "file", path: location }],
    explanation: `${location} is load-bearing in this repository.`,
    remediation: "Add tests and split responsibilities.",
    remediationEstimate: "1 week",
    priority,
    confidence: 0.7,
  });
  return {
    landmines: [
      landmine("db/client.ts", "complexity-bomb", "high", 1),
      landmine("server/app.ts", "coupling-cluster", "medium", 2),
      landmine("core/index.ts", "silent-assumption", "low", 3),
    ],
  };
}

function synthesisOutput() {
  const claim = (text: string) => ({ claim: text, sources: [readmeSource], confidence: 0.75 });
  return {
    narrative:
      "Widget is a deliberately small layered service with core, server, and db modules. The data layer is centralized in db/client.ts, which the rest of the system depends on. The codebase is coherent and low-risk overall, with the main concern being concentration of data-access responsibility in a single module.",
    rewriteAssessment: {
      verdict: "build-on" as const,
      reasons: [claim("The architecture is coherent."), claim("Modules are cleanly separated."), claim("The codebase is small and understandable.")],
      risks: [claim("Data access is concentrated in one module.")],
      confidence: 0.7,
      uncertainty: "Limited history was available for this synthetic repository.",
    },
    topFindings: [{ title: "Centralized data layer", claim: "db/client.ts is the dependency hub.", sources: [readmeSource], confidence: 0.7, severity: "medium" as const }],
    claims: [claim("Build on the existing structure.")],
    flaggedClaims: [],
  };
}

// Builds a fake NVIDIA client. When `failOnAgent` is set, the matching agent call
// throws *before* reporting usage — modeling a mid-pipeline NVIDIA failure.
function makeNvidia(failOnAgent?: string): OpenAI {
  return {
    chat: {
      completions: {
        create: async ({ messages }: { messages: Array<{ content?: unknown }> }) => {
          const system = String(messages[0]?.content ?? "");
          if (failOnAgent && system.includes(failOnAgent)) {
            throw new Error(`simulated NVIDIA failure for ${failOnAgent}`);
          }
          let output: unknown;
          if (system.includes("Architecture Agent")) output = architectureOutput();
          else if (system.includes("History Agent")) output = historyOutput();
          else if (system.includes("Risk Agent")) output = riskOutput();
          else if (system.includes("Synthesis Agent")) output = synthesisOutput();
          else throw new Error(`unexpected agent system prompt: ${system.slice(0, 40)}`);
          // callJson streams: yield the JSON as a content delta, then a usage chunk.
          const content = JSON.stringify(output);
          return (async function* () {
            yield { choices: [{ delta: { content } }] };
            yield { choices: [{ delta: {} }], usage: { total_tokens: 100 } };
          })();
        },
      },
    },
  } as unknown as OpenAI;
}

// --- capturing harness ---
interface Harness {
  store: AnalysisJobStore;
  artifacts: ArtifactStore;
  emitter: ProgressEmitter;
  savedBriefs: BriefOutput[];
  stageCompleted: string[];
  events: StageEvent[];
  tokenTotal: { value: number };
  completedTokens: { value: number | undefined };
  failure: { value: string | undefined };
  stageFailure: { value: string | undefined };
}

function makeHarness(): Harness {
  const savedBriefs: BriefOutput[] = [];
  const stageCompleted: string[] = [];
  const events: StageEvent[] = [];
  const tokenTotal = { value: 0 };
  const completedTokens: { value: number | undefined } = { value: undefined };
  const failure: { value: string | undefined } = { value: undefined };
  const stageFailure: { value: string | undefined } = { value: undefined };

  const store: AnalysisJobStore = {
    async ensureAnalysisRecord() {},
    async markAnalysisRunning() {},
    async markAnalysisCompleted(_id, tokens) {
      completedTokens.value = tokens;
    },
    async markAnalysisFailed(_id, message) {
      failure.value = message;
    },
    async addTokenUsage(_id, tokens) {
      tokenTotal.value += tokens;
    },
    async markStageStarted() {},
    async markStageCompleted(_id, stageName) {
      stageCompleted.push(stageName);
    },
    async markStageFailed(_id, stageName, message) {
      stageFailure.value = `${stageName}: ${message}`;
    },
    async recordArtifact() {},
    async saveBrief(brief) {
      savedBriefs.push(brief);
    },
    async close() {},
  };

  const artifacts: ArtifactStore = {
    async putJson(_id, type, value) {
      return { key: `${type}.json`, sizeBytes: Buffer.byteLength(JSON.stringify(value)) };
    },
    async getBuffer() {
      throw new Error("getBuffer should not be called in this test");
    },
  };

  const emitter: ProgressEmitter = {
    async emit(event) {
      events.push(event);
    },
    close() {},
  };

  return { store, artifacts, emitter, savedBriefs, stageCompleted, events, tokenTotal, completedTokens, failure, stageFailure };
}

function makePayload(): AnalysisJobPayload {
  return {
    analysisId: randomUUID(),
    userId: "user-1",
    projectId: randomUUID(),
    repoOwner: "acme",
    repoName: "widget",
    repoUrl: "https://github.com/acme/widget",
    config: AnalysisConfigSchema.parse({}),
  };
}

const env = loadPipelineEnv();

// === Scenario A: full happy path ===
const happy = makeHarness();
const result = await runAnalysisJob(makePayload(), {
  env,
  artifacts: happy.artifacts,
  store: happy.store,
  emitter: happy.emitter,
  github: fakeGithub,
  nvidia: makeNvidia(),
});

const savedBriefs = happy.savedBriefs;
const stageCompleted = happy.stageCompleted;
const events = happy.events;
const tokenTotalFromAddCalls = happy.tokenTotal.value;
const completedTokens = happy.completedTokens.value;
const failure = happy.failure.value;

assert(!failure, `pipeline failed: ${failure}`);
assert(typeof result.briefId === "string" && result.briefId.length > 0, "expected a briefId");

// Four agents, one NVIDIA call each (all outputs valid first try), 100 tokens each.
assert(result.tokensUsed === 400, `expected 400 tokens, got ${result.tokensUsed}`);
assert(completedTokens === 400, `markAnalysisCompleted should record 400 tokens, got ${completedTokens}`);
assert(tokenTotalFromAddCalls === 400, `incremental addTokenUsage should sum to 400, got ${tokenTotalFromAddCalls}`);

// Every pipeline stage completed, including the new analyze:complexity stage.
assert(stageCompleted.length === PIPELINE_STAGES.length, `expected all ${PIPELINE_STAGES.length} stages completed, got ${stageCompleted.length}`);
for (const stage of PIPELINE_STAGES) {
  assert(stageCompleted.includes(stage), `stage ${stage} did not complete`);
}
assert(events.some((event) => event.event === "analysis_complete"), "expected an analysis_complete event");

// A single, schema-valid brief was produced.
assert(savedBriefs.length === 1, `expected one saved brief, got ${savedBriefs.length}`);
const brief = savedBriefs[0];
assert(!!brief, "brief should be defined");
const parsed = BriefOutputSchema.safeParse(brief);
assert(parsed.success, `brief failed schema validation: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`);

if (brief) {
  // Diagram built from real AST: core/server/db modules with resolved dependency edges.
  const nodeIds = new Set(brief.architectureDiagram.nodes.map((node) => node.id));
  assert(nodeIds.has("core") && nodeIds.has("server") && nodeIds.has("db"), `expected core/server/db modules, got ${[...nodeIds].join(",")}`);
  const depEdges = brief.architectureDiagram.edges.filter((edge) => edge.kind === "dependency");
  assert(depEdges.some((edge) => edge.source === "core" && edge.target === "db"), "expected resolved core -> db dependency edge");
  assert(depEdges.some((edge) => edge.source === "server" && edge.target === "db"), "expected resolved server -> db dependency edge");

  // Agent outputs flowed into the brief.
  assert(brief.landmines.length === 3, `expected 3 landmines, got ${brief.landmines.length}`);
  assert(brief.decisions.length === 1, `expected 1 decision, got ${brief.decisions.length}`);
  assert(brief.topFindings.length === 1, "expected 1 top finding");
  assert(brief.assessment.verdict === "build-on", "expected build-on verdict");

  // repoStats computed from real fake-repo data, including age + commit frequency.
  assert(brief.repoStats.fileCount === treeFiles.length, "repoStats file count");
  assert(brief.repoStats.contributorCount === 2, "repoStats contributor count (alice + bob)");
  assert(brief.repoStats.repoAgeDays !== undefined && brief.repoStats.repoAgeDays > 0, "repoStats repo age populated");
  assert(brief.repoStats.commitsPerMonth !== undefined, "repoStats commit frequency populated");

  // Model versions recorded from env.
  assert(typeof brief.modelVersions.architecture === "string", "model versions recorded");
}

// === Scenario B: NVIDIA fails on the 4th (synthesis) agent ===
// This is the reason token usage is persisted incrementally: a run that dies
// partway through must still account for the tokens already spent. Architecture,
// History, and Risk each succeed (100 tokens, persisted via addTokenUsage) before
// Synthesis throws, so 300 tokens must be on record even though the run never
// completes and no brief is ever saved.
const failed = makeHarness();
let threw = false;
try {
  await runAnalysisJob(makePayload(), {
    env,
    artifacts: failed.artifacts,
    store: failed.store,
    emitter: failed.emitter,
    github: fakeGithub,
    nvidia: makeNvidia("Synthesis Agent"),
  });
} catch (error) {
  threw = true;
  assert(/simulated NVIDIA failure/.test(String(error)), `unexpected error: ${String(error)}`);
}

assert(threw, "a synthesis-stage NVIDIA failure should reject the job");
assert(failed.tokenTotal.value === 300, `failed run should still record 300 tokens from the 3 completed agents, got ${failed.tokenTotal.value}`);
assert(failed.completedTokens.value === undefined, "markAnalysisCompleted must not be called for a failed run");
assert(failed.stageFailure.value?.startsWith("agent:synthesis") === true, `failure should be attributed to agent:synthesis, got ${failed.stageFailure.value}`);
assert(failed.failure.value !== undefined, "markAnalysisFailed should record the failure");
assert(failed.savedBriefs.length === 0, "no brief should be saved for a failed run");
assert(!failed.stageCompleted.includes("agent:synthesis"), "the synthesis stage must not be marked complete");
assert(failed.stageCompleted.includes("agent:risk"), "stages before the failure should still complete");
assert(failed.events.some((event) => event.event === "analysis_failed"), "expected an analysis_failed event");

process.stdout.write("analysis job integration tests passed\n");
