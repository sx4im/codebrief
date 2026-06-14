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
export function sourceKey(source: SourceCitation): string {
  return [
    source.type,
    source.path || "",
    source.url || "",
    source.number ?? "",
    source.hash || "",
    source.excerpt || "",
    source.section || "",
    source.storageKey || "",
  ].join("|");
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

  const keys = new Set(sources.map(sourceKey));
  // Module paths shown in the architecture diagram are legitimate brief file references.
  for (const node of brief.architectureDiagram.nodes) {
    if (node.path) keys.add(sourceKey({ type: "file", path: node.path }));
  }
  return keys;
}

export function validateAnswerGrounding(answer: QAAnswer, contextSourceKeys: Set<string>): string[] {
  const issues: string[] = [];
  answer.sources.forEach((source, index) => {
    // A pointer to the brief itself (e.g. { type: "brief", section: "..." }) is
    // always grounded — the brief is the agent's context.
    if (source.type === "brief") return;
    if (!contextSourceKeys.has(sourceKey(source))) {
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
