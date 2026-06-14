import type { ArchitectureOutput, Decision, Landmine, QAAnswer, SynthesisOutput } from "@codebrief/shared";

// The agent prompts must SHOW the model the exact JSON shape to return — telling it
// to "match the schema" is not enough, since the model never sees the Zod schema.
// These examples are typed against the real output types, so TypeScript guarantees
// they stay schema-valid, and they are injected verbatim into each system prompt.

export const SOURCE_CITATION_RULES = [
  "Every claim/decision/landmine/finding/answer must cite at least one source in its sources/evidence array.",
  'A source is an object { "type": ..., ...identifier }. Use the identifier required by the type:',
  '- "file" | "readme" | "docs": include "path" (e.g. "src/index.ts").',
  '- "pr" | "issue": include "url" or "number".',
  '- "commit": include "hash" or "url".',
  '- "dependency" | "metric": include "excerpt" or "path".',
  '- "brief": include "section". "inferred": include "excerpt".',
  'Only use "inferred" (with an "excerpt" explaining the reasoning) when no concrete file/PR/commit evidence exists; such claims should carry confidence below 0.5.',
  "confidence is always a number from 0 to 1.",
].join("\n");

const architectureExample: ArchitectureOutput = {
  purpose: {
    claim: "Acme is a billing platform that lets SaaS teams meter usage and invoice customers.",
    sources: [{ type: "readme", path: "README.md" }],
    confidence: 0.85,
  },
  mainWorkflows: [
    {
      name: "Usage metering",
      claim: "Usage events are ingested through the api module and aggregated in the metering module.",
      sources: [{ type: "file", path: "src/api/usage.ts" }],
      confidence: 0.7,
    },
  ],
  dataModel: {
    claim: "Domain data is stored in Postgres, defined in the db module.",
    sources: [{ type: "file", path: "src/db/schema.ts" }],
    confidence: 0.75,
  },
  integrations: [
    {
      name: "Stripe",
      kind: "billing",
      claim: "Stripe processes payments and webhooks update invoice state.",
      sources: [{ type: "file", path: "src/billing/stripe.ts" }],
      confidence: 0.8,
    },
  ],
  architecturePattern: {
    claim: "Layered modular monolith with clear api/service/db separation.",
    sources: [{ type: "inferred", excerpt: "single deployable with internal module boundaries" }],
    confidence: 0.7,
  },
  claims: [
    { claim: "The codebase is written in TypeScript.", sources: [{ type: "dependency", path: "package.json" }], confidence: 0.9 },
    { claim: "Authentication is handled by Clerk.", sources: [{ type: "file", path: "src/auth/clerk.ts" }], confidence: 0.8 },
    { claim: "Background work runs through a queue worker.", sources: [{ type: "file", path: "src/worker/index.ts" }], confidence: 0.7 },
  ],
  confidence: 0.78,
  flaggedClaims: [],
};

const historyExample: { decisions: Decision[] } = {
  decisions: [
    {
      title: "Adopt Postgres over MongoDB",
      description: "The team standardized on Postgres for relational integrity.",
      context: "Debated while designing the billing data model.",
      evidence: [{ type: "pr", url: "https://github.com/acme/acme/pull/42" }],
      assessment: "Sound: the relational model fits invoicing and reporting.",
      confidence: 0.7,
    },
  ],
};

const riskExample: { landmines: Landmine[] } = {
  landmines: [
    {
      location: "src/core/engine.ts",
      category: "complexity-bomb",
      severity: "high",
      evidence: [
        { type: "file", path: "src/core/engine.ts" },
        { type: "metric", excerpt: "cyclomatic complexity 84; top 5% by dependency centrality" },
      ],
      explanation: "engine.ts is the most complex and most depended-on file, so changes ripple across the system.",
      remediation: "Extract sub-responsibilities and add characterization tests before refactoring.",
      remediationEstimate: "1-2 weeks",
      priority: 1,
      confidence: 0.75,
    },
  ],
};

const synthesisExample: SynthesisOutput = {
  narrative:
    "Acme is a layered modular monolith for SaaS billing. The api module ingests usage, the metering module aggregates it, and the billing module invoices customers through Stripe. The data layer is centralized in Postgres. Overall the codebase is coherent, though a handful of core files concentrate complexity and dependency, which is the main maintenance risk a new owner should plan around.",
  rewriteAssessment: {
    verdict: "build-on",
    reasons: [
      { claim: "Module boundaries are clear and consistent.", sources: [{ type: "inferred", excerpt: "single deployable with internal module boundaries" }], confidence: 0.7 },
      { claim: "The data model is centralized and well-typed.", sources: [{ type: "file", path: "src/db/schema.ts" }], confidence: 0.7 },
      { claim: "Most decisions in history look sound in retrospect.", sources: [{ type: "pr", url: "https://github.com/acme/acme/pull/42" }], confidence: 0.65 },
    ],
    risks: [{ claim: "Core engine complexity concentrates refactor risk.", sources: [{ type: "file", path: "src/core/engine.ts" }], confidence: 0.7 }],
    confidence: 0.7,
    uncertainty: "Limited PR history was available before 2023.",
  },
  topFindings: [
    {
      title: "Complexity concentrated in the core engine",
      claim: "src/core/engine.ts is the top landmine and should be stabilized first.",
      sources: [{ type: "file", path: "src/core/engine.ts" }],
      confidence: 0.75,
      severity: "high",
    },
  ],
  claims: [{ claim: "Building on the existing structure is the lower-risk path.", sources: [{ type: "file", path: "src/db/schema.ts" }], confidence: 0.7 }],
  flaggedClaims: [],
};

const qaExample: QAAnswer = {
  answer: "Removing the jobs module would break background invoicing, which depends on it per the brief's landmine map.",
  sources: [{ type: "brief", section: "landmines" }],
  confidence: "medium",
  caveat: "Based on the brief; the live job wiring was not re-inspected.",
};

function block(label: string, constraints: string[], example: unknown): string {
  return [
    label,
    ...constraints,
    SOURCE_CITATION_RULES,
    "Return ONLY a JSON object with exactly this shape (values are illustrative):",
    JSON.stringify(example, null, 2),
  ].join("\n");
}

export const SCHEMA_GUIDE = {
  architecture: block(
    "Output a single JSON object with keys: purpose, mainWorkflows, dataModel, integrations, architecturePattern, claims, confidence, flaggedClaims.",
    [
      "mainWorkflows must have at least 1 item; each workflow item is a claim object plus a \"name\".",
      "integrations items are claim objects plus \"name\" and \"kind\" (one of database|auth|storage|api|queue|billing|analytics|other).",
      "claims must have at least 3 items. flaggedClaims may be []. ",
    ],
    architectureExample,
  ),
  history: block(
    'Output a single JSON object: { "decisions": Decision[] } with 5-15 decisions (fewer only if the evidence is thin).',
    [
      "Each Decision has: title, description, context, evidence (>=1 source), assessment, confidence.",
      "evidence sources should be concrete pr/issue/commit/file citations, not inferred.",
    ],
    historyExample,
  ),
  risk: block(
    'Output a single JSON object: { "landmines": Landmine[] }, ranked by priority (1 = highest).',
    [
      "Each Landmine has: location, category (one of churn-trap|coupling-cluster|dependency-debt|complexity-bomb|knowledge-silo|silent-assumption), severity (critical|high|medium|low), evidence (>=1 source), explanation, remediation, remediationEstimate, priority (positive integer), confidence.",
      "location must name a concrete file, module, or dependency.",
    ],
    riskExample,
  ),
  synthesis: block(
    "Output a single JSON object with keys: narrative, rewriteAssessment, topFindings, claims, flaggedClaims.",
    [
      "narrative is a 400-800 word string (at least 100 characters).",
      "rewriteAssessment has: verdict (build-on|partial-rewrite|full-rewrite), reasons (>=3 claims), risks (>=1 claim), confidence, uncertainty (non-empty string).",
      "topFindings has 1-3 items; each is a claim object plus \"title\" and \"severity\".",
      "claims has >=1 item.",
      "CRITICAL: every source you cite MUST be copied verbatim from a source object that already appears in the architecture, decisions, or landmines input you were given. Do not invent new sources and do not use { \"type\": \"brief\" } — reuse the exact upstream source objects so the citation can be traced back.",
    ],
    synthesisExample,
  ),
  qa: block(
    "Output a single JSON object with keys: answer, sources, confidence, caveat.",
    [
      "sources must have >=1 item. confidence is one of high|medium|low. caveat is optional.",
      'If the data does not support a confident answer, say so in "answer", set confidence to "low", and still cite what you did consult.',
    ],
    qaExample,
  ),
};
