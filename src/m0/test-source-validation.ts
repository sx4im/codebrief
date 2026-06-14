import {
  downgradeUnsourcedClaims,
  parseArchitectureOutput,
  validateArchitectureSources,
} from "./source-validation.js";
import { evaluateM0Gate } from "./gate.js";
import type { ArchitectureOutput } from "./types.js";

const sourcedClaim = {
  claim: "Supabase positions itself as an open source Firebase alternative.",
  sources: [{ type: "readme" as const, path: "README.md" }],
  confidence: 0.95,
};

const validOutput: ArchitectureOutput = {
  purpose: sourcedClaim,
  mainWorkflows: [
    {
      claim: "The dashboard workflow is represented by TypeScript app files.",
      sources: [{ type: "file", path: "apps/studio/pages/project/[ref].tsx" }],
      confidence: 0.8,
    },
  ],
  dataModel: {
    claim: "Postgres is central to the product data model.",
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
    sourcedClaim,
    {
      claim: "A specific PR touched architecture-relevant files.",
      sources: [{ type: "pr", number: 123, url: "https://github.com/supabase/supabase/pull/123" }],
      confidence: 0.8,
    },
    {
      claim: "A specific file exports application behavior.",
      sources: [{ type: "file", path: "apps/studio/lib/api.ts" }],
      confidence: 0.75,
    },
  ],
  confidence: 0.85,
  flaggedClaims: [],
};

const valid = validateArchitectureSources(validOutput);
if (!valid.valid || valid.specificSourceClaimCount < 3) {
  throw new Error(`Expected valid sourced output, got ${JSON.stringify(valid)}`);
}
const validGate = evaluateM0Gate(validOutput, valid);
if (!validGate.passed || validGate.failures.length > 0) {
  throw new Error(`Expected valid output to pass M0 gate signals, got ${JSON.stringify(validGate)}`);
}

const invalidOutput: ArchitectureOutput = {
  ...validOutput,
  claims: [
    ...validOutput.claims,
    {
      claim: "This claim lacks evidence.",
      sources: [],
      confidence: 0.7,
    },
  ],
};

const invalid = validateArchitectureSources(invalidOutput);
if (invalid.valid || invalid.issues.length !== 1) {
  throw new Error(`Expected one source validation issue, got ${JSON.stringify(invalid)}`);
}

const downgraded = downgradeUnsourcedClaims(invalidOutput);
const afterDowngrade = validateArchitectureSources(downgraded);
if (!afterDowngrade.valid || downgraded.flaggedClaims.length !== 1) {
  throw new Error("Expected unsourced claim to be downgraded and flagged");
}
const downgradedGate = evaluateM0Gate(downgraded, afterDowngrade);
if (downgradedGate.sourceValidationPassed || downgradedGate.passed) {
  throw new Error(`Expected downgraded flagged output not to pass M0 gate, got ${JSON.stringify(downgradedGate)}`);
}
if (!downgradedGate.failures.some((failure) => failure.includes("downgraded"))) {
  throw new Error(`Expected downgraded output to include a failure reason, got ${JSON.stringify(downgradedGate)}`);
}

const missingSourcesParsed = parseArchitectureOutput({
  ...validOutput,
  claims: [
    ...validOutput.claims,
    {
      claim: "Missing sources should parse so validation can trigger retry.",
      confidence: 0.6,
    },
  ],
});
const missingSourcesValidation = validateArchitectureSources(missingSourcesParsed);
if (missingSourcesValidation.valid) {
  throw new Error("Expected missing sources to fail validation after parsing");
}

const emptyCitationOutput: ArchitectureOutput = {
  ...validOutput,
  claims: [
    ...validOutput.claims,
    {
      claim: "This claim has a source object without a usable reference.",
      sources: [{ type: "file" }],
      confidence: 0.7,
    },
  ],
};
const emptyCitationValidation = validateArchitectureSources(emptyCitationOutput);
if (
  emptyCitationValidation.valid ||
  !emptyCitationValidation.issues.some((issue) => issue.includes("missing a path"))
) {
  throw new Error(`Expected empty file citation to fail validation, got ${JSON.stringify(emptyCitationValidation)}`);
}
const downgradedEmptyCitation = downgradeUnsourcedClaims(emptyCitationOutput);
if (
  downgradedEmptyCitation.flaggedClaims.length !== 1 ||
  downgradedEmptyCitation.claims.at(-1)?.confidence !== 0
) {
  throw new Error("Expected empty citation claim to be downgraded and flagged");
}

process.stdout.write("source validation tests passed\n");
