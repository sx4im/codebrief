import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { AnalysisConfigSchema, AnalysisJobPayloadSchema } from "@codebrief/shared";
import { loadPipelineEnv, requireEnv } from "../env.js";
import { runAnalysisJob } from "./analysis.job.js";
import { createJobStore } from "../storage/postgres-job-store.js";
import { createArtifactStore } from "../storage/r2-client.js";
import { createProgressEmitter } from "../websocket/emit.js";

// Run the full pipeline against ONE repo, writing artifacts (incl. brief.json) to
// artifacts/one/<owner>-<name>. GitHub responses are disk-cached, so re-runs only
// pay for the agent calls — fast iteration on prompt/model issues. Usage:
//   npx tsx packages/pipeline/src/jobs/run-one.ts shadcn-ui/ui [quick|full]
const [ownerName = "shadcn-ui/ui", scopeArg = "quick"] = process.argv.slice(2);
const [owner, name] = ownerName.split("/");
if (!owner || !name) throw new Error(`expected owner/name, got "${ownerName}"`);

const env = loadPipelineEnv();
requireEnv(env.GITHUB_TOKEN, "GITHUB_TOKEN");
requireEnv(env.NVIDIA_API_KEY, "NVIDIA_API_KEY");

const outDir = path.resolve("artifacts/one", `${owner}-${name}`);
await mkdir(outDir, { recursive: true });
const runEnv = { ...env, ARTIFACT_STORAGE_DRIVER: "local" as const, ARTIFACT_LOCAL_DIR: path.relative(process.cwd(), outDir) };

const scope = scopeArg === "full" ? "full" : "quick";
const config = AnalysisConfigSchema.parse({
  scope,
  scopeCommits: scope === "full" ? 500 : 100,
  scopePullRequests: scope === "full" ? 200 : 50,
  scopeIssues: scope === "full" ? 200 : 100,
  includePrivate: false,
});
const payload = AnalysisJobPayloadSchema.parse({
  analysisId: randomUUID(),
  projectId: randomUUID(),
  userId: "run-one",
  repoOwner: owner,
  repoName: name,
  repoUrl: `https://github.com/${owner}/${name}`,
  githubToken: runEnv.GITHUB_TOKEN,
  config,
});

const artifacts = createArtifactStore(runEnv);
const store = createJobStore(runEnv.DATABASE_URL);
const emitter = createProgressEmitter(runEnv.SOCKET_IO_URL);
try {
  const result = await runAnalysisJob(payload, { env: runEnv, artifacts, store, emitter });
  process.stdout.write(`\nrun-one OK: ${ownerName} briefId=${result.briefId} tokens=${result.tokensUsed}\nartifacts: ${outDir}\n`);
} catch (error) {
  process.stdout.write(`\nrun-one FAILED: ${ownerName}\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  emitter.close();
  await store.close();
}
