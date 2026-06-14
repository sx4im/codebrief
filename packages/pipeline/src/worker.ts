import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { AnalysisJobPayloadSchema } from "@codebrief/shared";
import { loadPipelineEnv } from "./env.js";
import { createArtifactStore } from "./storage/r2-client.js";
import { createJobStore } from "./storage/postgres-job-store.js";
import { createProgressEmitter } from "./websocket/emit.js";
import { runAnalysisJob } from "./jobs/analysis.job.js";

const env = loadPipelineEnv();
const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
const artifacts = createArtifactStore(env);
const store = createJobStore(env.DATABASE_URL);
const emitter = createProgressEmitter(env.SOCKET_IO_URL);

const worker = new Worker(
  "analysis",
  async (job) => {
    const payload = AnalysisJobPayloadSchema.parse(job.data);
    return runAnalysisJob(payload, { env, artifacts, emitter, store });
  },
  {
    connection: connection as never,
    concurrency: env.WORKER_CONCURRENCY,
  },
);

worker.on("completed", (job) => {
  process.stdout.write(`analysis job ${job.id} completed\n`);
});

worker.on("failed", (job, error) => {
  process.stderr.write(`analysis job ${job?.id || "unknown"} failed: ${error.message}\n`);
});

process.on("SIGTERM", async () => {
  emitter.close();
  await worker.close();
  await store.close();
  await connection.quit();
});
