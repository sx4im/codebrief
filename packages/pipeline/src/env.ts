import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  SOCKET_IO_URL: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_ARCHITECTURE_MODEL: z.string().default("stepfun-ai/step-3.7-flash"),
  NVIDIA_HISTORY_MODEL: z.string().default("stepfun-ai/step-3.7-flash"),
  NVIDIA_SYNTHESIS_MODEL: z.string().default("stepfun-ai/step-3.7-flash"),
  NVIDIA_RISK_MODEL: z.string().default("deepseek-ai/deepseek-v4-flash"),
  NVIDIA_QA_MODEL: z.string().default("deepseek-ai/deepseek-v4-flash"),
  // Per-request ceiling so a model that stalls (e.g. one that does not support
  // guided JSON and hangs instead of erroring) fails cleanly instead of wedging
  // the worker. Bounded retries cover transient 5xx/connection blips.
  NVIDIA_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  NVIDIA_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  ARTIFACT_STORAGE_DRIVER: z.enum(["r2", "local"]).default("local"),
  ARTIFACT_LOCAL_DIR: z.string().default("artifacts/pipeline"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
});

export type PipelineEnv = z.infer<typeof EnvSchema>;

export function loadPipelineEnv(): PipelineEnv {
  return EnvSchema.parse(process.env);
}

export function requireEnv(value: string | undefined, name: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

