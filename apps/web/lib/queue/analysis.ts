import "server-only";
import { Queue } from "bullmq";
import type { AnalysisJobPayload } from "@codebrief/shared";

let queue: Queue<AnalysisJobPayload, unknown, string> | null = null;

export function getAnalysisQueue(): Queue<AnalysisJobPayload> {
  if (queue) return queue;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("Missing required environment variable: REDIS_URL");
  }
  queue = new Queue<AnalysisJobPayload, unknown, string>("analysis", {
    connection: { url: redisUrl } as never,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
  return queue;
}

export async function enqueueAnalysis(payload: AnalysisJobPayload) {
  return getAnalysisQueue().add("analysis", payload, {
    jobId: payload.analysisId,
  });
}
