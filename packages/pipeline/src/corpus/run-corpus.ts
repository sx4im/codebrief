import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Queue } from "bullmq";
import type { AnalysisConfig, AnalysisJobPayload } from "@codebrief/shared";
import { AnalysisConfigSchema, AnalysisJobPayloadSchema } from "@codebrief/shared";
import { loadPipelineEnv, requireEnv } from "../env.js";
import { runAnalysisJob } from "../jobs/analysis.job.js";
import { createJobStore } from "../storage/postgres-job-store.js";
import { createArtifactStore } from "../storage/r2-client.js";
import { createProgressEmitter } from "../websocket/emit.js";
import { DEFAULT_CORPUS_REPOS } from "./repos.js";

type Mode = "direct" | "queue" | "dry-run";

interface CliOptions {
  mode: Mode;
  scope: "quick" | "full";
  outputDir: string;
  only: string[];
}

interface CorpusManifestEntry {
  analysisId: string;
  projectId: string;
  repoFullName: string;
  category: string;
  mode: Mode;
  status: "planned" | "queued" | "complete" | "failed";
  error?: string;
  tokensUsed?: number;
}

const options = parseArgs(process.argv.slice(2));
const env = loadPipelineEnv();
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.resolve(options.outputDir, runId);
const runEnv = {
  ...env,
  ARTIFACT_LOCAL_DIR:
    options.mode === "direct" && env.ARTIFACT_STORAGE_DRIVER === "local"
      ? path.relative(process.cwd(), path.join(outputDir, "pipeline"))
      : env.ARTIFACT_LOCAL_DIR,
};

await mkdir(outputDir, { recursive: true });
const config = AnalysisConfigSchema.parse(corpusConfig(options.scope));
const manifest: CorpusManifestEntry[] = [];

const selectedRepos =
  options.only.length > 0
    ? DEFAULT_CORPUS_REPOS.filter((repo) => {
        const full = `${repo.owner}/${repo.name}`;
        return options.only.includes(full) || options.only.includes(repo.name);
      })
    : DEFAULT_CORPUS_REPOS;

for (const repo of selectedRepos) {
  const analysisId = randomUUID();
  const projectId = randomUUID();
  const payload = AnalysisJobPayloadSchema.parse({
    analysisId,
    projectId,
    userId: "corpus-runner",
    repoOwner: repo.owner,
    repoName: repo.name,
    repoUrl: repo.repoUrl,
    githubToken: runEnv.GITHUB_TOKEN,
    config,
  });
  manifest.push({
    analysisId,
    projectId,
    repoFullName: `${repo.owner}/${repo.name}`,
    category: repo.category,
    mode: options.mode,
    status: "planned",
  });

  if (options.mode === "dry-run") continue;
  if (options.mode === "queue") {
    await enqueue(payload);
    manifest.at(-1)!.status = "queued";
    continue;
  }

  try {
    const result = await runDirect(payload);
    manifest.at(-1)!.status = "complete";
    manifest.at(-1)!.tokensUsed = result.tokensUsed;
  } catch (error) {
    // Continue to the next repo instead of aborting the whole corpus: a transient
    // failure on one repo (e.g. an upstream connection blip) must not discard the
    // analyses of the others. Failed repos can be re-run with --only.
    manifest.at(-1)!.status = "failed";
    manifest.at(-1)!.error = error instanceof Error ? error.message : String(error);
  }
}

await writeFile(path.join(outputDir, "manifest.json"), JSON.stringify({ runId, options, manifest }, null, 2));
process.stdout.write(`${JSON.stringify({ runId, outputDir, manifest }, null, 2)}\n`);

async function runDirect(payload: AnalysisJobPayload) {
  requireEnv(runEnv.GITHUB_TOKEN, "GITHUB_TOKEN");
  requireEnv(runEnv.NVIDIA_API_KEY, "NVIDIA_API_KEY");
  const artifacts = createArtifactStore(runEnv);
  const store = createJobStore(runEnv.DATABASE_URL);
  const emitter = createProgressEmitter(runEnv.SOCKET_IO_URL);
  try {
    return await runAnalysisJob(payload, { env: runEnv, artifacts, store, emitter });
  } finally {
    emitter.close();
    await store.close();
  }
}

async function enqueue(payload: AnalysisJobPayload) {
  const redisUrl = requireEnv(runEnv.REDIS_URL, "REDIS_URL");
  requireEnv(runEnv.GITHUB_TOKEN, "GITHUB_TOKEN");
  requireEnv(runEnv.NVIDIA_API_KEY, "NVIDIA_API_KEY");
  const queue = new Queue<AnalysisJobPayload, unknown, string>("analysis", {
    connection: { url: redisUrl } as never,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
  try {
    await queue.add("analysis", payload, { jobId: payload.analysisId });
  } finally {
    await queue.close();
  }
}

function corpusConfig(scope: "quick" | "full"): AnalysisConfig {
  return {
    scope,
    scopeCommits: scope === "full" ? 500 : 100,
    scopePullRequests: scope === "full" ? 200 : 50,
    scopeIssues: scope === "full" ? 200 : 100,
    includePrivate: false,
  };
}

function parseArgs(args: string[]): CliOptions {
  const modeValue = getArg(args, "--mode") || "dry-run";
  const scopeValue = getArg(args, "--scope") || "quick";
  const onlyValue = getArg(args, "--only");
  return {
    mode: modeValue === "direct" || modeValue === "queue" || modeValue === "dry-run" ? modeValue : "dry-run",
    scope: scopeValue === "full" ? "full" : "quick",
    outputDir: getArg(args, "--out") || "artifacts/corpus",
    only: onlyValue ? onlyValue.split(",").map((value) => value.trim()).filter(Boolean) : [],
  };
}

function getArg(args: string[], name: string): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
