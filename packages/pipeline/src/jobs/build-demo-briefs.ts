import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { BriefOutputSchema, type BriefOutput, type FileAstSummary } from "@codebrief/shared";
import { buildArchitectureDiagram } from "../output/diagram.js";
import type { CouplingCluster } from "../analysis/coupling.js";

// One-off content generator: turn the real credentialed corpus briefs into the
// committed public demo dataset (apps/web/lib/demo-briefs.json). Run after a
// successful `pipeline:corpus` direct run.

const corpusRoot = path.resolve("artifacts/corpus");
const runDirs = readdirSync(corpusRoot).filter((d) => !d.startsWith(".")).sort();
if (runDirs.length === 0) throw new Error("no corpus runs found");

function loadArtifact<T>(dir: string, prefix: string): T | null {
  const file = readdirSync(dir).find((f) => f.startsWith(`${prefix}-`));
  return file ? (JSON.parse(readFileSync(path.join(dir, file), "utf8")) as T) : null;
}

// Collect the newest valid brief per repo across all runs. Recompute each brief's
// architecture diagram from the real cached AST/coupling artifacts so the committed
// demo reflects the current (adaptive-granularity) diagram builder without needing a
// fresh paid agent run — the diagram is a deterministic function of those inputs.
const byRepo = new Map<string, BriefOutput>();
for (const runDir of runDirs) {
  const pipelineDir = path.join(corpusRoot, runDir, "pipeline");
  if (!existsSync(pipelineDir)) continue;
  for (const analysisId of readdirSync(pipelineDir)) {
    const dir = path.join(pipelineDir, analysisId);
    const briefFile = readdirSync(dir).find((f) => f.startsWith("brief-"));
    if (!briefFile) continue;
    const parsed = BriefOutputSchema.safeParse(JSON.parse(readFileSync(path.join(dir, briefFile), "utf8")));
    if (!parsed.success) continue;
    const brief = parsed.data;
    const ast = loadArtifact<FileAstSummary[]>(dir, "ast");
    const coupling = loadArtifact<CouplingCluster[]>(dir, "coupling");
    if (ast) brief.architectureDiagram = buildArchitectureDiagram(ast, brief.landmines, coupling ?? []);
    byRepo.set(brief.repoFullName, brief);
  }
}

function slugFor(repoFullName: string): string {
  const [owner = "", name = ""] = repoFullName.split("/");
  return !name || name.toLowerCase() === "ui" || name === owner ? owner : name;
}

function summaryFor(brief: BriefOutput): string {
  const text = brief.systemNarrative.purpose.claim.trim();
  if (text.length <= 150) return text;
  const cut = text.slice(0, 150);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

const order = ["shadcn-ui/ui", "supabase/supabase", "django/django", "rails/rails", "go-gorm/gorm"];
const repos = [...byRepo.keys()].sort((a, b) => {
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
});

const demoBriefs = repos.map((repo) => {
  const brief = byRepo.get(repo)!;
  return { ...brief, slug: slugFor(repo), summary: summaryFor(brief) };
});

const out = path.resolve("apps/web/lib/demo-briefs.json");
writeFileSync(out, `${JSON.stringify(demoBriefs, null, 2)}\n`);
process.stdout.write(`wrote ${demoBriefs.length} demo briefs to ${out}\n`);
demoBriefs.forEach((b) => process.stdout.write(`  ${b.slug.padEnd(12)} ${b.repoFullName.padEnd(18)} landmines=${b.landmines.length} nodes=${b.architectureDiagram.nodes.length}\n`));
