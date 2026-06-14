import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BriefOutputSchema, type BriefOutput, type Landmine, type SourceCitation } from "@codebrief/shared";
import {
  validateArchitecture,
  validateClaims,
  validateDecisions,
  validateLandmines,
  validateRewriteAssessment,
} from "../adapters/source-validation.js";

interface RepoGateResult {
  repoFullName: string;
  passed: boolean;
  issues: string[];
  landmineCount: number;
  specificLandmineCount: number;
  languages: string[];
}

interface GateReport {
  passed: boolean;
  briefCount: number;
  languageCoverage: {
    typescript: number;
    python: number;
    go: number;
    ruby: number;
    java: number;
    mixed: number;
  };
  issues: string[];
  repos: RepoGateResult[];
}

if (isMain()) {
  const target = process.argv[2] || "artifacts/pipeline";
  const files = await collectBriefFiles(path.resolve(target));
  const briefs = await readBriefs(files);
  const report = verifyBriefs(briefs);

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

export function verifyBriefs(briefs: BriefOutput[]): GateReport {
  const repos = briefs.map(verifyBrief);
  const languageCoverage = {
    typescript: briefs.filter(hasTypeScript).length,
    python: briefs.filter(hasPython).length,
    go: briefs.filter(hasGo).length,
    ruby: briefs.filter(hasRuby).length,
    java: briefs.filter(hasJava).length,
    mixed: briefs.filter(isMixed).length,
  };
  const issues: string[] = [];

  if (briefs.length < 5) issues.push(`Expected at least 5 briefs, found ${briefs.length}`);
  if (languageCoverage.typescript < 1) issues.push("Expected at least one TypeScript/JavaScript repo");
  if (languageCoverage.python < 1) issues.push("Expected at least one Python repo");
  if (languageCoverage.go < 1) issues.push("Expected at least one Go repo");
  if (languageCoverage.ruby + languageCoverage.java < 1) issues.push("Expected at least one Ruby or Java repo");
  if (languageCoverage.mixed < 1) issues.push(`Expected at least one mixed-language repo, found ${languageCoverage.mixed}`);
  for (const repo of repos) {
    if (!repo.passed) issues.push(`${repo.repoFullName}: ${repo.issues.join("; ")}`);
  }

  return {
    passed: issues.length === 0,
    briefCount: briefs.length,
    languageCoverage,
    issues,
    repos,
  };
}

function verifyBrief(brief: BriefOutput): RepoGateResult {
  const issues: string[] = [];
  collectValidationIssues(brief).forEach((issue) => issues.push(issue));

  const specificLandmines = brief.landmines.filter(isSpecificLandmine);
  if (specificLandmines.length < 3) {
    issues.push(`Expected at least 3 specific landmines with evidence, found ${specificLandmines.length}`);
  }

  if (!brief.systemNarrative.purpose.claim.trim()) issues.push("Missing system narrative purpose");
  if (brief.decisions.length === 0) issues.push("Missing decision archaeology output");
  if (brief.landmines.length === 0) issues.push("Missing landmine map output");
  if (!brief.assessment.verdict) issues.push("Missing rewrite assessment verdict");
  if (brief.architectureDiagram.nodes.length === 0) issues.push("Missing architecture diagram nodes");

  return {
    repoFullName: brief.repoFullName,
    passed: issues.length === 0,
    issues,
    landmineCount: brief.landmines.length,
    specificLandmineCount: specificLandmines.length,
    languages: Object.keys(brief.repoStats.languageBreakdown).sort(),
  };
}

function collectValidationIssues(brief: BriefOutput): string[] {
  const results = [
    ["architecture", validateArchitecture(brief.systemNarrative)],
    ["decisions", validateDecisions(brief.decisions)],
    ["landmines", validateLandmines(brief.landmines)],
    ["assessment", validateRewriteAssessment(brief.assessment)],
    ["topFindings", validateClaims(brief.topFindings, "top finding")],
    ["flaggedClaims", validateClaims(brief.flaggedClaims, "flagged claim")],
  ] as const;
  return results.flatMap(([label, result]) => result.issues.map((issue) => `${label}: ${issue}`));
}

async function collectBriefFiles(root: string): Promise<string[]> {
  const rootStat = await stat(root);
  if (rootStat.isFile()) return [root];
  const output: string[] = [];
  await walk(root, output);
  return output.filter((file) => /(^|\/)brief-\d+\.json$/.test(file) || file.endsWith(".brief.json") || file.endsWith("brief.json"));
}

async function walk(dir: string, output: string[]) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(child, output);
    } else if (entry.isFile()) {
      output.push(child);
    }
  }
}

async function readBriefs(files: string[]): Promise<BriefOutput[]> {
  const briefs: BriefOutput[] = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
    const result = BriefOutputSchema.safeParse(raw);
    if (result.success) briefs.push(result.data);
  }
  return briefs;
}

function isSpecificLandmine(landmine: Landmine): boolean {
  return isSpecificPath(landmine.location) && landmine.evidence.length > 0 && landmine.evidence.every(hasUsableSource);
}

function isSpecificPath(value: string): boolean {
  return /[/\\]/.test(value) && /\.[a-z0-9]+$/i.test(value.split(/[/\\]/).at(-1) || "");
}

function hasUsableSource(source: SourceCitation): boolean {
  return Boolean(source.path || source.url || source.number || source.hash || source.excerpt || source.section || source.storageKey);
}

function hasTypeScript(brief: BriefOutput): boolean {
  const languages = brief.repoStats.languageBreakdown;
  return Boolean(languages.ts || languages.tsx || languages.js || languages.jsx);
}

function hasPython(brief: BriefOutput): boolean {
  return Boolean(brief.repoStats.languageBreakdown.py);
}

function hasGo(brief: BriefOutput): boolean {
  return Boolean(brief.repoStats.languageBreakdown.go);
}

function hasRuby(brief: BriefOutput): boolean {
  const languages = brief.repoStats.languageBreakdown;
  return Boolean(languages.rb || languages.erb || languages.rake || languages.gemspec);
}

function hasJava(brief: BriefOutput): boolean {
  const languages = brief.repoStats.languageBreakdown;
  return Boolean(languages.java || languages.kt || languages.gradle);
}

function isMixed(brief: BriefOutput): boolean {
  return Object.values(brief.repoStats.languageBreakdown).filter((count) => count > 0).length >= 3;
}

function isMain(): boolean {
  return process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
}
