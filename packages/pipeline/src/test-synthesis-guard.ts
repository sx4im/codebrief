import assert from "node:assert/strict";
import type { ArchitectureOutput, Decision, Landmine, SynthesisOutput } from "@codebrief/shared";
import { collectUpstreamSourceKeys, validateSynthesisAgainstUpstream } from "./agents/synthesis.js";

const readmeSource = { type: "readme" as const, path: "README.md" };
const fileSource = { type: "file" as const, path: "src/core.ts" };
const prSource = { type: "pr" as const, number: 42, url: "https://github.com/acme/app/pull/42" };

const architecture: ArchitectureOutput = {
  purpose: { claim: "The app manages repository analysis.", sources: [readmeSource], confidence: 0.8 },
  mainWorkflows: [{ name: "Analyze repo", claim: "Repo analysis starts in src/core.ts.", sources: [fileSource], confidence: 0.8 }],
  dataModel: { claim: "Analysis state is persisted.", sources: [fileSource], confidence: 0.8 },
  integrations: [],
  architecturePattern: { claim: "The app is pipeline-oriented.", sources: [readmeSource], confidence: 0.7 },
  claims: [
    { claim: "The app manages repository analysis.", sources: [readmeSource], confidence: 0.8 },
    { claim: "Repo analysis starts in src/core.ts.", sources: [fileSource], confidence: 0.8 },
    { claim: "The app is pipeline-oriented.", sources: [readmeSource], confidence: 0.7 },
  ],
  confidence: 0.78,
  flaggedClaims: [],
};

const decisions: Decision[] = [
  {
    title: "Use pipeline stages",
    description: "The system records stage-level progress.",
    context: "A staged pipeline provides clear handoff evidence.",
    evidence: [prSource],
    assessment: "Still useful.",
    confidence: 0.75,
  },
];

const landmines: Landmine[] = [
  {
    location: "src/core.ts",
    category: "complexity-bomb",
    severity: "high",
    evidence: [fileSource],
    explanation: "Core analysis logic is concentrated.",
    remediation: "Add focused regression coverage.",
    remediationEstimate: "2 days",
    priority: 1,
    confidence: 0.7,
  },
];

const upstream = collectUpstreamSourceKeys({ architecture, decisions, landmines });

const baseOutput: SynthesisOutput = {
  narrative:
    "This repository is best understood as a pipeline-oriented analysis application. It starts repository analysis from a core module, persists analysis state, and surfaces staged progress for operators. The synthesis must reuse upstream evidence only so the resulting brief does not introduce unsupported facts.",
  rewriteAssessment: {
    verdict: "build-on",
    reasons: [
      { claim: "The app manages repository analysis.", sources: [readmeSource], confidence: 0.8 },
      { claim: "Repo analysis starts in src/core.ts.", sources: [fileSource], confidence: 0.8 },
      { claim: "The app is pipeline-oriented.", sources: [readmeSource], confidence: 0.7 },
    ],
    risks: [{ claim: "Core analysis logic is concentrated.", sources: [fileSource], confidence: 0.7 }],
    confidence: 0.74,
    uncertainty: "Local synthetic test fixture.",
  },
  topFindings: [{ title: "Pipeline architecture", severity: "high", claim: "The app is pipeline-oriented.", sources: [readmeSource], confidence: 0.7 }],
  claims: [{ claim: "The system records stage-level progress.", sources: [prSource], confidence: 0.75 }],
  flaggedClaims: [],
};

assert.equal(validateSynthesisAgainstUpstream(baseOutput, upstream).valid, true);

const unsupported = structuredClone(baseOutput);
unsupported.claims = [
  {
    claim: "The app has a billing integration.",
    sources: [{ type: "file", path: "src/billing.ts" }],
    confidence: 0.7,
  },
];
const unsupportedResult = validateSynthesisAgainstUpstream(unsupported, upstream);
assert.equal(unsupportedResult.valid, false);
assert.match(unsupportedResult.issues.join("\n"), /not present in upstream/);

const flagged = structuredClone(baseOutput);
const downgraded = {
  claim: "A failed claim was downgraded.",
  sources: [{ type: "inferred" as const, excerpt: "Synthesis source validation failed after retry." }],
  confidence: 0,
};
flagged.claims = [downgraded];
flagged.flaggedClaims = [downgraded];
assert.equal(validateSynthesisAgainstUpstream(flagged, upstream).valid, true);

process.stdout.write("synthesis guard tests passed\n");
