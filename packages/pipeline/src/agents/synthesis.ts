import {
  SynthesisOutputSchema,
  type ArchitectureOutput,
  type Decision,
  type Landmine,
  type RepoStats,
  type RewriteAssessment,
  type SourceCitation,
  type SourcedClaim,
  type SynthesisOutput,
} from "@codebrief/shared";
import type OpenAI from "openai";
import type { PipelineEnv } from "../env.js";
import { callAgent } from "../adapters/nvidia-nim.js";
import { repairSynthesis, validateSynthesis, type ValidationResult } from "../adapters/source-validation.js";
import { SCHEMA_GUIDE } from "./schema-guide.js";

export async function runSynthesisAgent(
  client: OpenAI,
  env: PipelineEnv,
  input: {
    architecture: ArchitectureOutput;
    decisions: Decision[];
    landmines: Landmine[];
    repoStats: RepoStats;
  },
  onTokenUsage?: (tokens: number) => void | Promise<void>,
): Promise<{ output: SynthesisOutput; assessment: RewriteAssessment; tokenUsage: number }> {
  const upstreamSourceKeys = collectUpstreamSourceKeys(input);
  const result = await callAgent(client, {
    model: env.NVIDIA_SYNTHESIS_MODEL,
    schema: SynthesisOutputSchema,
    validate: (output) => validateSynthesisAgainstUpstream(output, upstreamSourceKeys),
    repair: repairSynthesis,
    onTokenUsage,
    systemPrompt: [
      "You are Codebrief's Synthesis Agent.",
      "Write a 400-800 word system narrative, rewrite assessment, and top findings.",
      "You may use only the structured architecture, history, risk, and repo stats input.",
      "Do not introduce new claims not present in upstream outputs.",
      "Every assessment reason, risk, finding, and claim must have non-empty usable sources.",
      SCHEMA_GUIDE.synthesis,
    ].join("\n"),
    userContent: input,
  });
  return {
    output: result.output,
    assessment: result.output.rewriteAssessment,
    tokenUsage: result.tokenUsage,
  };
}

export function validateSynthesisAgainstUpstream(output: SynthesisOutput, upstreamSourceKeys: Set<string>): ValidationResult {
  const base = validateSynthesis(output);
  const issues = [...base.issues];
  const claims = [
    ...output.rewriteAssessment.reasons,
    ...output.rewriteAssessment.risks,
    ...output.topFindings,
    ...output.claims,
  ];

  for (const [claimIndex, claim] of claims.entries()) {
    for (const [sourceIndex, source] of claim.sources.entries()) {
      if (isValidationFallbackClaim(claim, source, output.flaggedClaims)) continue;
      if (!upstreamSourceKeys.has(sourceKey(source))) {
        issues.push(`synthesis claim ${claimIndex + 1} source ${sourceIndex + 1} was not present in upstream agent outputs: ${claim.claim}`);
      }
    }
  }

  return { valid: issues.length === 0, issues, flaggedClaimCount: base.flaggedClaimCount };
}

function isValidationFallbackClaim(claim: SourcedClaim, source: SourceCitation, flaggedClaims: SourcedClaim[]): boolean {
  return (
    claim.confidence === 0 &&
    source.type === "inferred" &&
    source.excerpt?.toLowerCase().includes("validation failed") === true &&
    flaggedClaims.some((flagged) => flagged.claim === claim.claim && flagged.confidence === 0)
  );
}

export function collectUpstreamSourceKeys(input: {
  architecture: ArchitectureOutput;
  decisions: Decision[];
  landmines: Landmine[];
}): Set<string> {
  const sources: SourceCitation[] = [];
  collectArchitectureClaims(input.architecture).forEach((claim) => sources.push(...claim.sources));
  input.decisions.forEach((decision) => sources.push(...decision.evidence));
  input.landmines.forEach((landmine) => sources.push(...landmine.evidence));
  return new Set(sources.map(sourceKey));
}

function collectArchitectureClaims(output: ArchitectureOutput): SourcedClaim[] {
  return [
    output.purpose,
    ...output.mainWorkflows,
    output.dataModel,
    ...output.integrations,
    output.architecturePattern,
    ...output.claims,
  ];
}

function sourceKey(source: SourceCitation): string {
  return [
    source.type,
    source.path || "",
    source.url || "",
    source.number || "",
    source.hash || "",
    source.excerpt || "",
    source.section || "",
    source.storageKey || "",
  ].join("|");
}
