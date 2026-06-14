import type {
  ArchitectureOutput,
  Decision,
  Finding,
  Landmine,
  QAAnswer,
  RewriteAssessment,
  SourceCitation,
  SourcedClaim,
  SynthesisOutput,
} from "@codebrief/shared";

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  flaggedClaimCount: number;
}

export function validateSourceCitation(source: SourceCitation): string[] {
  const hasText = (value: string | undefined) => typeof value === "string" && value.trim().length > 0;
  if (source.type === "file" || source.type === "readme" || source.type === "docs") {
    return hasText(source.path) ? [] : [`${source.type} source is missing path`];
  }
  if (source.type === "pr" || source.type === "issue") {
    return hasText(source.url) || source.number !== undefined ? [] : [`${source.type} source is missing url or number`];
  }
  if (source.type === "commit") {
    return hasText(source.hash) || hasText(source.url) ? [] : ["commit source is missing hash or url"];
  }
  if (source.type === "dependency" || source.type === "metric") {
    return hasText(source.excerpt) || hasText(source.path) ? [] : [`${source.type} source is missing excerpt or path`];
  }
  if (source.type === "brief") {
    return hasText(source.section) ? [] : ["brief source is missing section"];
  }
  if (source.type === "inferred") {
    return hasText(source.excerpt) ? [] : ["inferred source is missing excerpt"];
  }
  return ["unsupported source type"];
}

export function validateClaims(claims: SourcedClaim[], label: string): ValidationResult {
  const issues: string[] = [];
  for (const [claimIndex, claim] of claims.entries()) {
    if (!claim.sources || claim.sources.length === 0) {
      issues.push(`${label} claim ${claimIndex + 1} has no sources: ${claim.claim}`);
      continue;
    }
    for (const [sourceIndex, source] of claim.sources.entries()) {
      for (const issue of validateSourceCitation(source)) {
        issues.push(`${label} claim ${claimIndex + 1} source ${sourceIndex + 1}: ${issue}`);
      }
    }
  }
  return { valid: issues.length === 0, issues, flaggedClaimCount: 0 };
}

export function validateArchitecture(output: ArchitectureOutput): ValidationResult {
  const claims = [
    output.purpose,
    ...output.mainWorkflows,
    output.dataModel,
    ...output.integrations,
    output.architecturePattern,
    ...output.claims,
  ];
  const result = validateClaims(claims, "architecture");
  return { ...result, flaggedClaimCount: output.flaggedClaims.length };
}

export function validateDecisions(decisions: Decision[]): ValidationResult {
  const issues = decisions.flatMap((decision, index) =>
    decision.evidence.flatMap((source, sourceIndex) =>
      validateSourceCitation(source).map((issue) => `decision ${index + 1} source ${sourceIndex + 1}: ${issue}`),
    ),
  );
  return { valid: issues.length === 0, issues, flaggedClaimCount: 0 };
}

export function validateLandmines(landmines: Landmine[]): ValidationResult {
  const issues = landmines.flatMap((landmine, index) =>
    landmine.evidence.flatMap((source, sourceIndex) =>
      validateSourceCitation(source).map((issue) => `landmine ${index + 1} source ${sourceIndex + 1}: ${issue}`),
    ),
  );
  return { valid: issues.length === 0, issues, flaggedClaimCount: 0 };
}

export function validateSynthesis(output: SynthesisOutput): ValidationResult {
  const assessmentClaims = [
    ...output.rewriteAssessment.reasons,
    ...output.rewriteAssessment.risks,
    ...output.topFindings,
    ...output.claims,
  ];
  const result = validateClaims(assessmentClaims, "synthesis");
  return { ...result, flaggedClaimCount: output.flaggedClaims.length };
}

export function validateRewriteAssessment(output: RewriteAssessment): ValidationResult {
  return validateClaims([...output.reasons, ...output.risks], "assessment");
}

export function validateQA(output: QAAnswer): ValidationResult {
  const issues = output.sources.flatMap((source, sourceIndex) =>
    validateSourceCitation(source).map((issue) => `qa source ${sourceIndex + 1}: ${issue}`),
  );
  return { valid: issues.length > 0 ? false : output.sources.length > 0, issues, flaggedClaimCount: 0 };
}

export function repairArchitecture(output: ArchitectureOutput): ArchitectureOutput {
  const flaggedClaims: SourcedClaim[] = [];
  const downgrade = <T extends SourcedClaim>(claim: T): T => {
    if (hasValidSources(claim.sources)) return claim;
    const repaired = { ...claim, confidence: 0, sources: [fallbackSource("Source validation failed after retry.")] };
    flaggedClaims.push(repaired);
    return repaired;
  };

  return {
    ...output,
    purpose: downgrade(output.purpose),
    mainWorkflows: output.mainWorkflows.map(downgrade),
    dataModel: downgrade(output.dataModel),
    integrations: output.integrations.map(downgrade),
    architecturePattern: downgrade(output.architecturePattern),
    claims: output.claims.map(downgrade),
    flaggedClaims: [...output.flaggedClaims, ...flaggedClaims],
  };
}

export function repairDecisions(decisions: Decision[]): Decision[] {
  return decisions.map((decision) =>
    hasValidSources(decision.evidence)
      ? decision
      : {
          ...decision,
          confidence: 0,
          evidence: [fallbackSource("Decision evidence failed source validation after retry.")],
        },
  );
}

export function repairLandmines(landmines: Landmine[]): Landmine[] {
  return landmines.map((landmine) =>
    hasValidSources(landmine.evidence)
      ? landmine
      : {
          ...landmine,
          confidence: 0,
          evidence: [fallbackSource("Landmine evidence failed source validation after retry.")],
        },
  );
}

export function repairSynthesis(output: SynthesisOutput): SynthesisOutput {
  const flaggedClaims: SourcedClaim[] = [];
  const downgrade = <T extends SourcedClaim>(claim: T): T => {
    if (hasValidSources(claim.sources)) return claim;
    const repaired = { ...claim, confidence: 0, sources: [fallbackSource("Synthesis source validation failed after retry.")] };
    flaggedClaims.push(repaired);
    return repaired;
  };

  return {
    ...output,
    rewriteAssessment: {
      ...output.rewriteAssessment,
      reasons: output.rewriteAssessment.reasons.map(downgrade),
      risks: output.rewriteAssessment.risks.map(downgrade),
    },
    topFindings: output.topFindings.map((finding): Finding => downgrade(finding)),
    claims: output.claims.map(downgrade),
    flaggedClaims: [...output.flaggedClaims, ...flaggedClaims],
  };
}

function hasValidSources(sources: SourceCitation[]): boolean {
  return sources.length > 0 && sources.every((source) => validateSourceCitation(source).length === 0);
}

function fallbackSource(excerpt: string): SourceCitation {
  return { type: "inferred", excerpt };
}
