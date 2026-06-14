import "dotenv/config";
import { Redis } from "ioredis";
import postgres from "postgres";

async function main() {
  const out: string[] = [];

  // --- Redis ---
  const redisUrl = process.env.REDIS_URL ?? "";
  try {
    const r = new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true, connectTimeout: 10000 });
    await r.connect();
    const pong = await r.ping();
    out.push(`REDIS ok: ping=${pong}`);
    await r.quit();
  } catch (e) {
    out.push(`REDIS FAIL: ${(e as Error).message}`);
  }

  // --- Postgres ---
  const dbUrl = process.env.DATABASE_URL ?? "";
  try {
    const sql = postgres(dbUrl, { max: 1, idle_timeout: 5, connect_timeout: 10 });
    const rows = await sql`select version() as v`;
    out.push(`POSTGRES ok: ${String(rows[0]?.v).slice(0, 40)}...`);
    await sql.end();
  } catch (e) {
    out.push(`POSTGRES FAIL: ${(e as Error).message}`);
  }

  process.stdout.write(out.join("\n") + "\n");
}

main();
