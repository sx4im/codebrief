import {
  ArchitectureOutputSchema,
  type ArchitectureOutput,
  type SourceCitation,
  type SourceValidationResult,
  type SourcedClaim,
} from "./types.js";

export function parseArchitectureOutput(raw: unknown): ArchitectureOutput {
  return ArchitectureOutputSchema.parse(raw);
}

export function validateArchitectureSources(output: ArchitectureOutput): SourceValidationResult {
  const claims = collectArchitectureClaims(output);
  const issues: string[] = [];
  let sourcedClaimCount = 0;
  let specificSourceClaimCount = 0;

  for (const [index, claim] of claims.entries()) {
    if (!claim.sources || claim.sources.length === 0) {
      issues.push(`Claim ${index + 1} has no sources: ${claim.claim}`);
      continue;
    }
    const sourceIssues = claim.sources.flatMap((source, sourceIndex) =>
      validateSourceCitation(source).map((issue) => `Claim ${index + 1} source ${sourceIndex + 1}: ${issue}`),
    );
    issues.push(...sourceIssues);
    if (sourceIssues.length === 0) {
      sourcedClaimCount += 1;
    }
    if (claim.sources.some(isSpecificSource)) {
      specificSourceClaimCount += 1;
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    sourcedClaimCount,
    specificSourceClaimCount,
    flaggedClaimCount: output.flaggedClaims?.length || 0,
  };
}

export function collectArchitectureClaims(output: ArchitectureOutput): SourcedClaim[] {
  return [
    output.purpose,
    ...output.mainWorkflows,
    output.dataModel,
    ...output.integrations,
    output.architecturePattern,
    ...output.claims,
  ];
}

export function downgradeUnsourcedClaims(output: ArchitectureOutput): ArchitectureOutput {
  const flaggedClaims: SourcedClaim[] = [];
  const downgrade = (claim: SourcedClaim): SourcedClaim => {
    if (claim.sources.length > 0 && claim.sources.every((source) => validateSourceCitation(source).length === 0)) {
      return claim;
    }
    const downgraded = {
      ...claim,
      confidence: 0,
      sources: [{ type: "inferred" as const, excerpt: "Source validation failed after retry." }],
    };
    flaggedClaims.push(downgraded);
    return downgraded;
  };

  return {
    ...output,
    purpose: downgrade(output.purpose),
    mainWorkflows: output.mainWorkflows.map(downgrade),
    dataModel: downgrade(output.dataModel),
    integrations: output.integrations.map(downgrade),
    architecturePattern: downgrade(output.architecturePattern),
    claims: output.claims.map(downgrade),
    flaggedClaims: [...(output.flaggedClaims || []), ...flaggedClaims],
  };
}

export function isSpecificSource(source: SourceCitation): boolean {
  if (source.type === "file" || source.type === "readme") {
    return hasText(source.path);
  }
  if (source.type === "pr") {
    return hasText(source.url) || source.number !== undefined;
  }
  if (source.type === "commit") {
    return hasText(source.hash) || hasText(source.url);
  }
  return false;
}

function validateSourceCitation(source: SourceCitation): string[] {
  if (source.type === "file" || source.type === "readme") {
    return hasText(source.path) ? [] : [`${source.type} source is missing a path`];
  }
  if (source.type === "pr") {
    return hasText(source.url) || source.number !== undefined ? [] : ["pr source is missing a url or number"];
  }
  if (source.type === "commit") {
    return hasText(source.hash) || hasText(source.url) ? [] : ["commit source is missing a hash or url"];
  }
  if (source.type === "inferred") {
    return hasText(source.excerpt) ? [] : ["inferred source is missing an excerpt"];
  }
  return ["source has an unsupported type"];
}

function hasText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
