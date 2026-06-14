import "server-only";
import { Redis } from "ioredis";

interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const localHits = new Map<string, { count: number; resetAt: number }>();
let redis: Redis | null = null;

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  if (process.env.REDIS_URL) return redisRateLimit(options);
  return localRateLimit(options);
}

async function redisRateLimit({ key, limit, windowMs }: RateLimitOptions): Promise<RateLimitResult> {
  redis ||= new Redis(process.env.REDIS_URL || "", { maxRetriesPerRequest: 1 });
  const redisKey = `rate-limit:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) await redis.pexpire(redisKey, windowMs);
  const ttl = await redis.pttl(redisKey);
  const retryAfterSeconds = Math.max(1, Math.ceil(ttl / 1000));
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds,
  };
}

function localRateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const existing = localHits.get(key);
  const bucket = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + windowMs } : existing;
  bucket.count += 1;
  localHits.set(key, bucket);
  return {
    ok: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}
