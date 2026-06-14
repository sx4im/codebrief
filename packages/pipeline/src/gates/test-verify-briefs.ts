import assert from "node:assert/strict";
import type { BriefOutput, RepoStats } from "@codebrief/shared";
import { verifyBriefs } from "./verify-briefs.js";

const validCorpus = [
  makeBrief("shadcn-ui/ui", { ts: 120, tsx: 80, md: 10 }),
  makeBrief("django/django", { py: 900, rst: 80, txt: 4 }),
  makeBrief("go-gorm/gorm", { go: 130, md: 12, yml: 3 }),
  makeBrief("rails/rails", { rb: 900, erb: 40, md: 20 }),
  makeBrief("supabase/supabase", { ts: 500, tsx: 300, sql: 120, go: 20 }),
];

const valid = verifyBriefs(validCorpus);
assert.equal(valid.passed, true, valid.issues.join("\n"));
assert.equal(valid.languageCoverage.ruby, 1, "expected the Ruby repo to be counted");

// Dropping the Ruby/Java repo for another TypeScript repo must fail the language-diversity gate.
const noRubyOrJava = [
  makeBrief("shadcn-ui/ui", { ts: 120, tsx: 80, md: 10 }),
  makeBrief("django/django", { py: 900, rst: 80, txt: 4 }),
  makeBrief("go-gorm/gorm", { go: 130, md: 12, yml: 3 }),
  makeBrief("vercel/next.js", { ts: 800, tsx: 200, md: 50 }),
  makeBrief("supabase/supabase", { ts: 500, tsx: 300, sql: 120, go: 20 }),
];
const noRubyOrJavaResult = verifyBriefs(noRubyOrJava);
assert.equal(noRubyOrJavaResult.passed, false);
assert.match(noRubyOrJavaResult.issues.join("\n"), /Ruby or Java/);

const missingSource = structuredClone(validCorpus);
missingSource[0]!.systemNarrative.purpose.sources = [];
const missingSourceResult = verifyBriefs(missingSource);
assert.equal(missingSourceResult.passed, false);
assert.match(missingSourceResult.issues.join("\n"), /has no sources/);

const weakLandmines = structuredClone(validCorpus);
weakLandmines[1]!.landmines = weakLandmines[1]!.landmines.slice(0, 2);
const weakLandminesResult = verifyBriefs(weakLandmines);
assert.equal(weakLandminesResult.passed, false);
assert.match(weakLandminesResult.issues.join("\n"), /Expected at least 3 specific landmines/);

process.stdout.write("brief verifier tests passed\n");

function makeBrief(repoFullName: string, languageBreakdown: RepoStats["languageBreakdown"]): BriefOutput {
  const source = { type: "file" as const, path: "src/core.ts" };
  const readme = { type: "readme" as const, path: "README.md" };
  return {
    id: `${repoFullName.replace("/", "-")}-brief`,
    analysisId: `${repoFullName.replace("/", "-")}-analysis`,
    repoFullName,
    createdAt: "2026-06-11T00:00:00.000Z",
    systemNarrative: {
      purpose: { claim: `${repoFullName} has a clear purpose.`, sources: [readme], confidence: 0.8 },
      mainWorkflows: [{ name: "Core workflow", claim: "Core workflow starts in src/core.ts.", sources: [source], confidence: 0.8 }],
      dataModel: { claim: "The data model is represented by source files.", sources: [source], confidence: 0.7 },
      integrations: [],
      architecturePattern: { claim: "The repository is modular.", sources: [{ type: "inferred", excerpt: "inferred from module structure" }], confidence: 0.7 },
      claims: [
        { claim: `${repoFullName} has a clear purpose.`, sources: [readme], confidence: 0.8 },
        { claim: "Core workflow starts in src/core.ts.", sources: [source], confidence: 0.8 },
        { claim: "The repository is modular.", sources: [{ type: "inferred", excerpt: "inferred from module structure" }], confidence: 0.7 },
      ],
      confidence: 0.75,
      flaggedClaims: [],
    },
    decisions: [
      {
        title: "Keep the core modular",
        description: "Core behavior is isolated into file-level modules.",
        context: "This makes future maintenance safer.",
        evidence: [source],
        assessment: "Still coherent.",
        confidence: 0.75,
      },
    ],
    landmines: ["src/core.ts", "src/pipeline.ts", "src/state.ts"].map((location, index) => ({
      location,
      category: "complexity-bomb" as const,
      severity: index === 0 ? ("high" as const) : ("medium" as const),
      evidence: [{ type: "file" as const, path: location }],
      explanation: `${location} concentrates important behavior.`,
      remediation: "Add regression coverage before refactoring.",
      remediationEstimate: "1-2 days",
      priority: index + 1,
      confidence: 0.7,
    })),
    assessment: {
      verdict: "build-on",
      reasons: [
        { claim: "The purpose is clear.", sources: [readme], confidence: 0.8 },
        { claim: "The core workflow is specific.", sources: [source], confidence: 0.8 },
        { claim: "The architecture is modular.", sources: [{ type: "inferred", excerpt: "inferred from module structure" }], confidence: 0.7 },
      ],
      risks: [{ claim: "Core files carry refactor risk.", sources: [source], confidence: 0.7 }],
      confidence: 0.75,
      uncertainty: "Synthetic verifier test fixture.",
    },
    topFindings: [{ title: "Clear core", severity: "high", claim: "The core workflow is specific.", sources: [source], confidence: 0.8 }],
    architectureDiagram: {
      nodes: [{ id: "src/core.ts", label: "core", path: "src/core.ts", severity: "high", landmineCount: 1 }],
      edges: [],
    },
    repoStats: {
      fileCount: 100,
      languageBreakdown,
      commitCount: 50,
      pullRequestCount: 20,
      contributorCount: 5,
    },
    modelVersions: {
      architecture: "test",
      history: "test",
      risk: "test",
      synthesis: "test",
    },
    flaggedClaims: [],
  };
}
