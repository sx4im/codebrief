import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const corpusRoot = path.resolve("artifacts/corpus");
const runDir = readdirSync(corpusRoot).filter((d) => !d.startsWith("."))[0]!;
const base = path.join(corpusRoot, runDir, "pipeline");
const manifest = JSON.parse(readFileSync(path.join(corpusRoot, runDir, "manifest.json"), "utf8")).manifest as Array<{
  analysisId: string;
  repoFullName: string;
  status: string;
  error?: string;
}>;

function isSpecific(loc: string): boolean {
  const seg = loc.split(/[/\\]/).pop() || "";
  return /[/\\]/.test(loc) && /\.[a-z0-9]+$/i.test(seg);
}

for (const m of manifest) {
  const dir = path.join(base, m.analysisId);
  if (!existsSync(dir)) {
    console.log(`${m.repoFullName.padEnd(18)} ${m.status} (no dir)`);
    continue;
  }
  const files = readdirSync(dir);
  const briefFile = files.find((f) => f.startsWith("brief-"));
  const astFile = files.find((f) => f.startsWith("ast-"));
  const astCount = astFile ? (JSON.parse(readFileSync(path.join(dir, astFile), "utf8")) as unknown[]).length : 0;
  let lm: string[] = [];
  if (briefFile) {
    const b = JSON.parse(readFileSync(path.join(dir, briefFile), "utf8")) as { landmines: Array<{ location: string; category: string }> };
    lm = b.landmines.map((l) => `${l.location}  [${l.category}]`);
  }
  const specific = lm.filter((l) => isSpecific(l.split("  [")[0]!));
  console.log(`\n${m.repoFullName.padEnd(18)} ${m.status.padEnd(9)} ast=${astCount} brief=${briefFile ? "Y" : "N"} landmines=${lm.length} specific=${specific.length}`);
  if (m.error) console.log(`   ERROR: ${m.error.slice(0, 200)}`);
  lm.forEach((l) => console.log(`   - ${l}`));
}
