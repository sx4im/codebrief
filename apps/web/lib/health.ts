import "server-only";
import { Redis } from "ioredis";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export type HealthState = "ok" | "missing" | "error" | "optional";

export interface HealthItem {
  id: string;
  label: string;
  state: HealthState;
  detail: string;
}

export interface HealthReport {
  status: "ok" | "degraded";
  liveAnalysisReady: boolean;
  privateRepoReady: boolean;
  items: HealthItem[];
}

export async function getHealthReport(options: { deep?: boolean } = {}): Promise<HealthReport> {
  const items: HealthItem[] = [
    envGroup("clerk", "Clerk auth", ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]),
    envGroup("github", "GitHub access", ["GITHUB_TOKEN"], "GitHub OAuth can also satisfy this per user."),
    envGroup("database", "Postgres", ["DATABASE_URL"]),
    envGroup("redis", "Redis/BullMQ", ["REDIS_URL"]),
    envGroup("nvidia", "NVIDIA NIM", [
      "NVIDIA_API_KEY",
      "NVIDIA_ARCHITECTURE_MODEL",
      "NVIDIA_HISTORY_MODEL",
      "NVIDIA_SYNTHESIS_MODEL",
      "NVIDIA_RISK_MODEL",
      "NVIDIA_QA_MODEL",
    ]),
    envGroup("r2", "Cloudflare R2", ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"]),
    envGroup("socket", "Socket.io", ["NEXT_PUBLIC_WS_URL", "SOCKET_IO_URL"], "Local polling still works without WebSocket configuration."),
    anyEnvGroup("sentry", "Sentry monitoring", ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"], "Set SENTRY_DSN for server events and NEXT_PUBLIC_SENTRY_DSN for browser events."),
    optionalEnv("puppeteer", "PDF Chrome", "PUPPETEER_EXECUTABLE_PATH"),
  ];

  if (options.deep) {
    await applyDatabaseCheck(items);
    await applyRedisCheck(items);
  }

  const liveAnalysisReady = hasOk(items, "database") && hasOk(items, "redis") && hasOk(items, "github") && hasOk(items, "nvidia");
  const privateRepoReady = hasOk(items, "clerk") && (hasOk(items, "github") || hasConfigured("GITHUB_CLIENT_ID"));
  const requiredIds = new Set(["clerk", "database", "redis", "github", "nvidia"]);
  const status = items.some((item) => requiredIds.has(item.id) && item.state !== "ok") ? "degraded" : "ok";

  return { status, liveAnalysisReady, privateRepoReady, items };
}

function envGroup(id: string, label: string, keys: string[], note?: string): HealthItem {
  const missing = keys.filter((key) => !hasConfigured(key));
  if (missing.length === 0) return { id, label, state: "ok", detail: "Configured" };
  return {
    id,
    label,
    state: "missing",
    detail: `${missing.join(", ")} missing${note ? `. ${note}` : ""}`,
  };
}

function anyEnvGroup(id: string, label: string, keys: string[], note: string): HealthItem {
  const configured = keys.filter((key) => hasConfigured(key));
  if (configured.length > 0) {
    return { id, label, state: "ok", detail: `${configured.join(", ")} configured` };
  }
  return {
    id,
    label,
    state: "missing",
    detail: `${keys.join(" or ")} missing. ${note}`,
  };
}

function optionalEnv(id: string, label: string, key: string): HealthItem {
  return hasConfigured(key)
    ? { id, label, state: "ok", detail: "Configured" }
    : { id, label, state: "optional", detail: `${key} not set; HTML export fallback remains available` };
}

async function applyDatabaseCheck(items: HealthItem[]) {
  const item = items.find((entry) => entry.id === "database");
  if (!item || item.state !== "ok") return;
  try {
    await getDb().execute(sql`select 1`);
    item.detail = "Configured and reachable";
  } catch (error) {
    item.state = "error";
    item.detail = error instanceof Error ? error.message : "Postgres check failed";
  }
}

async function applyRedisCheck(items: HealthItem[]) {
  const item = items.find((entry) => entry.id === "redis");
  if (!item || item.state !== "ok") return;
  const redis = new Redis(process.env.REDIS_URL || "", { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await redis.connect();
    await redis.ping();
    item.detail = "Configured and reachable";
  } catch (error) {
    item.state = "error";
    item.detail = error instanceof Error ? error.message : "Redis check failed";
  } finally {
    redis.disconnect();
  }
}

function hasOk(items: HealthItem[], id: string) {
  return items.find((item) => item.id === id)?.state === "ok";
}

function hasConfigured(key: string) {
  return Boolean(process.env[key]?.trim());
}
