import "server-only";
import type { BriefOutput, QAAnswer, SourceCitation, SourcedClaim } from "@codebrief/shared";

/**
 * Q&A anti-hallucination guard. The Q&A agent is instructed to cite only sources
 * copied from the brief, but nothing enforced it: `validateSources` only checks
 * that each citation has *some* usable field, so the model could invent a
 * plausible file path or PR number and pass. This mirrors the pipeline's
 * synthesis-upstream guard for the Q&A boundary: every cited source must already
 * exist in the brief (the agent's grounding context).
 */
// Concrete locators that can be fabricated (a path, PR number, commit hash, etc.).
// Free-text fields (excerpt, section) are deliberately excluded: the model
// paraphrases them, so matching on them rejected legitimate citations of real
// brief sources. The anti-hallucination guard only needs to verify locators.
export function sourceLocators(source: SourceCitation): string[] {
  const locators: string[] = [];
  if (source.path) locators.push(`path:${source.path}`);
  if (source.url) locators.push(`url:${source.url}`);
  if (source.number !== undefined && source.number !== null) locators.push(`number:${source.number}`);
  if (source.hash) locators.push(`hash:${source.hash}`);
  if (source.storageKey) locators.push(`storageKey:${source.storageKey}`);
  return locators;
}

export function collectBriefSourceKeys(brief: BriefOutput): Set<string> {
  const sources: SourceCitation[] = [];
  const pushClaim = (claim: SourcedClaim) => sources.push(...claim.sources);

  const narrative = brief.systemNarrative;
  [narrative.purpose, narrative.dataModel, narrative.architecturePattern].forEach(pushClaim);
  narrative.mainWorkflows.forEach(pushClaim);
  narrative.integrations.forEach(pushClaim);
  narrative.claims.forEach(pushClaim);

  brief.decisions.forEach((decision) => sources.push(...decision.evidence));
  brief.landmines.forEach((landmine) => sources.push(...landmine.evidence));
  brief.assessment.reasons.forEach(pushClaim);
  brief.assessment.risks.forEach(pushClaim);
  brief.topFindings.forEach(pushClaim);
  brief.flaggedClaims.forEach(pushClaim);

  const keys = new Set(sources.flatMap(sourceLocators));
  // Module paths shown in the architecture diagram are legitimate brief file references.
  for (const node of brief.architectureDiagram.nodes) {
    if (node.path) keys.add(`path:${node.path}`);
  }
  return keys;
}

export function validateAnswerGrounding(answer: QAAnswer, contextSourceKeys: Set<string>): string[] {
  const issues: string[] = [];
  answer.sources.forEach((source, index) => {
    // A pointer to the brief itself (e.g. { type: "brief", section: "..." }) is
    // always grounded — the brief is the agent's context.
    if (source.type === "brief") return;
    const locators = sourceLocators(source);
    // A source with no concrete locator (only an excerpt/section) cannot fabricate
    // a file path or PR, so there is nothing to verify against the brief.
    if (locators.length === 0) return;
    if (!locators.some((locator) => contextSourceKeys.has(locator))) {
      issues.push(`Source ${index + 1} cites evidence not present in the brief: ${describeSource(source)}`);
    }
  });
  return issues;
}

function describeSource(source: SourceCitation): string {
  return (
    [source.type, source.path, source.url, source.number, source.hash, source.section]
      .filter((part) => part !== undefined && part !== "")
      .join(" ") || source.type
  );
}
