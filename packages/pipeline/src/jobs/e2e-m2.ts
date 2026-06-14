import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import postgres from "postgres";
import { AnalysisConfigSchema, AnalysisJobPayloadSchema } from "@codebrief/shared";
import { loadPipelineEnv } from "../env.js";
import { createArtifactStore } from "../storage/r2-client.js";
import { createJobStore } from "../storage/postgres-job-store.js";
import { createProgressEmitter } from "../websocket/emit.js";
import { runAnalysisJob } from "./analysis.job.js";

// End-to-end M2 backend proof: enqueue a real analysis on the BullMQ "analysis"
// queue (Redis), let a real Worker consume it, run the full pipeline, and verify
// the results persisted to Postgres. Mirrors worker.ts + lib/queue/analysis.ts.
const env = loadPipelineEnv();
const repoOwner = process.env.E2E_OWNER ?? "sindresorhus";
const repoName = process.env.E2E_REPO ?? "ts-extras";

const payload = AnalysisJobPayloadSchema.parse({
  analysisId: randomUUID(),
  projectId: randomUUID(),
  userId: "m2-e2e-user",
  repoOwner,
  repoName,
  repoUrl: `https://github.com/${repoOwner}/${repoName}`,
  config: AnalysisConfigSchema.parse({ scope: "quick", scopeCommits: 60, scopePullRequests: 25, scopeIssues: 40 }),
});

const artifacts = createArtifactStore(env);
const store = createJobStore(env.DATABASE_URL);
const emitter = createProgressEmitter(env.SOCKET_IO_URL);
const queue = new Queue("analysis", { connection: { url: env.REDIS_URL } as never });
const workerConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const worker = new Worker(
  "analysis",
  async (job) => {
    const p = AnalysisJobPayloadSchema.parse(job.data);
    return runAnalysisJob(p, { env, artifacts, emitter, store });
  },
  { connection: workerConnection as never, concurrency: 1 },
);

async function shutdown() {
  await worker.close();
  await queue.close();
  await store.close();
  await workerConnection.quit().catch(() => {});
  emitter.close();
}

async function main() {
  process.stdout.write(`enqueueing analysis ${payload.analysisId} for ${repoOwner}/${repoName}\n`);
  const completion = new Promise<void>((resolve, reject) => {
    worker.on("completed", () => resolve());
    worker.on("failed", (_job, err) => reject(err));
  });
  await queue.add("analysis", payload, { jobId: payload.analysisId });

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("e2e timed out after 540s")), 540_000).unref(),
  );
  await Promise.race([completion, timeout]);

  // Verify persistence directly from Postgres.
  const sql = postgres(env.DATABASE_URL ?? "", { prepare: false, max: 1 });
  const [analysis] = await sql<{ status: string; tokens_used: number }[]>`
    select status, tokens_used from analyses where id = ${payload.analysisId}
  `;
  const [brief] = await sql<{ id: string }[]>`select id from briefs where analysis_id = ${payload.analysisId}`;
  const stages = await sql<{ stage_name: string; status: string }[]>`
    select stage_name, status from pipeline_stages where analysis_id = ${payload.analysisId}
  `;
  const artifactRows = await sql<{ n: number }[]>`select count(*)::int as n from artifacts where analysis_id = ${payload.analysisId}`;
  const doneStages = stages.filter((s) => s.status === "done").length;

  process.stdout.write("\n=== M2 PERSISTENCE CHECK ===\n");
  process.stdout.write(`analysis.status = ${analysis?.status}\n`);
  process.stdout.write(`analysis.tokens_used = ${analysis?.tokens_used}\n`);
  process.stdout.write(`brief row present = ${Boolean(brief)} (${brief?.id ?? "none"})\n`);
  process.stdout.write(`pipeline_stages done = ${doneStages}/${stages.length}\n`);
  process.stdout.write(`artifacts persisted = ${artifactRows[0]?.n ?? 0}\n`);

  const ok = analysis?.status === "complete" && Boolean(brief) && doneStages === stages.length && stages.length > 0;

  // Clean up the test data (cascades to projects/analyses/stages/briefs/artifacts).
  if (process.env.E2E_KEEP !== "1") {
    await sql`delete from users where id = ${payload.userId}`;
    process.stdout.write("cleaned up e2e test rows\n");
  }
  await sql.end({ timeout: 5 });

  process.stdout.write(ok ? "\nM2 E2E PASS\n" : "\nM2 E2E FAIL\n");
  await shutdown();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  process.stderr.write(`M2 E2E ERROR: ${(e as Error).message}\n`);
  await shutdown().catch(() => {});
  process.exit(1);
});
