import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

// Apply the SQL migrations in drizzle/ directly. The files are idempotent
// (CREATE ... IF NOT EXISTS), and there is no drizzle meta journal, so we run
// them through the simple query protocol rather than drizzle-kit migrate.
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL");
  const sql = postgres(url, { prepare: false, max: 1 });
  const dir = path.resolve("drizzle");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const content = readFileSync(path.join(dir, file), "utf8");
    process.stdout.write(`applying ${file} ...\n`);
    await sql.unsafe(content);
  }
  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `;
  process.stdout.write(`tables: ${tables.map((t) => t.table_name).join(", ")}\n`);
  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  process.stderr.write(`migration failed: ${(e as Error).message}\n`);
  process.exit(1);
});
