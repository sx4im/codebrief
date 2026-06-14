import { enforceArchitectureSources } from "./nvidia.js";
import { validateArchitectureSources } from "./source-validation.js";
import type { ArchitectureOutput } from "./types.js";

const usage = {
  promptTokens: 10,
  completionTokens: 5,
  totalTokens: 15,
};

const validOutput: ArchitectureOutput = {
  purpose: {
    claim: "Supabase is an open source Firebase alternative.",
    sources: [{ type: "readme", path: "README.md" }],
    confidence: 0.95,
  },
  mainWorkflows: [
    {
      claim: "The repository contains a dashboard workflow.",
      sources: [{ type: "file", path: "apps/studio/pages/project/[ref].tsx" }],
      confidence: 0.8,
    },
  ],
  dataModel: {
    claim: "Postgres is central to the product.",
    sources: [{ type: "readme", path: "README.md" }],
    confidence: 0.9,
  },
  integrations: [],
  architecturePattern: {
    claim: "The architecture is inferred from a multi-package repository layout.",
    sources: [{ type: "inferred", excerpt: "inferred from module structure" }],
    confidence: 0.6,
  },
  claims: [
    {
      claim: "Supabase is an open source Firebase alternative.",
      sources: [{ type: "readme", path: "README.md" }],
      confidence: 0.95,
    },
    {
      claim: "A concrete PR source is available.",
      sources: [{ type: "pr", number: 123, url: "https://github.com/supabase/supabase/pull/123" }],
      confidence: 0.8,
    },
    {
      claim: "A concrete file source is available.",
      sources: [{ type: "file", path: "apps/studio/lib/api.ts" }],
      confidence: 0.75,
    },
  ],
  confidence: 0.85,
  flaggedClaims: [],
};

const invalidOutput = {
  ...validOutput,
  claims: [
    ...validOutput.claims,
    {
      claim: "This claim intentionally omits sources so the retry path runs.",
      confidence: 0.7,
    },
  ],
};

let correctionCalls = 0;
const corrected = await enforceArchitectureSources(
  { content: invalidOutput, usage },
  async (issues) => {
    correctionCalls += 1;
    if (!issues.some((issue) => issue.includes("has no sources"))) {
      throw new Error(`Expected retry to receive validation issues, got ${JSON.stringify(issues)}`);
    }
    return { content: validOutput, usage };
  },
);

if (correctionCalls !== 1) {
  throw new Error(`Expected one correction call, got ${correctionCalls}`);
}
if (!validateArchitectureSources(corrected.output).valid || corrected.output.flaggedClaims.length !== 0) {
  throw new Error("Expected corrected output to pass source validation without flagged claims");
}
if (corrected.tokenUsage.totalTokens !== 30) {
  throw new Error(`Expected token usage to include first and retry calls, got ${corrected.tokenUsage.totalTokens}`);
}

const stillInvalid = await enforceArchitectureSources(
  { content: invalidOutput, usage },
  async () => ({ content: invalidOutput, usage }),
);

if (stillInvalid.output.flaggedClaims.length !== 1) {
  throw new Error(`Expected one flagged claim after failed retry, got ${stillInvalid.output.flaggedClaims.length}`);
}
if (stillInvalid.output.claims.at(-1)?.confidence !== 0) {
  throw new Error("Expected still-unsourced claim confidence to be downgraded to 0");
}
if (!validateArchitectureSources(stillInvalid.output).valid) {
  throw new Error("Expected downgraded output to have replacement inferred sources after failed retry");
}

const alreadyValid = await enforceArchitectureSources(
  { content: validOutput, usage },
  async () => {
    throw new Error("Correction call should not run for valid output");
  },
);

if (alreadyValid.tokenUsage.totalTokens !== 15) {
  throw new Error("Expected valid output token usage to include only the first call");
}

process.stdout.write("agent retry tests passed\n");
