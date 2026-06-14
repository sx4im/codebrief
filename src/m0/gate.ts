import { collectArchitectureClaims } from "./source-validation.js";
import type { ArchitectureOutput, M0GateSignals, SourceValidationResult } from "./types.js";

export function evaluateM0Gate(
  architecture: ArchitectureOutput,
  validation: SourceValidationResult,
): M0GateSignals {
  const joinedClaims = collectArchitectureClaims(architecture)
    .map((claim) => claim.claim)
    .join("\n");
  const noFlaggedClaims = validation.flaggedClaimCount === 0;
  const sourceValidationPassed = validation.valid && noFlaggedClaims;
  const failures: string[] = [];
  const signals = {
    mentionsFirebaseAlternative: /firebase/i.test(joinedClaims) && /alternative/i.test(joinedClaims),
    mentionsPostgres: /postgres(?:ql)?/i.test(joinedClaims),
    hasAtLeastThreeSpecificSourceClaims: validation.specificSourceClaimCount >= 3,
    noFlaggedClaims,
    sourceValidationPassed,
    passed: false,
    failures,
  };

  if (!signals.mentionsFirebaseAlternative) {
    failures.push("Architecture output did not identify Supabase as a Firebase alternative.");
  }
  if (!signals.mentionsPostgres) {
    failures.push("Architecture output did not identify Postgres/PostgreSQL as central.");
  }
  if (!signals.hasAtLeastThreeSpecificSourceClaims) {
    failures.push("Architecture output had fewer than 3 claims with specific file, PR, README, or commit sources.");
  }
  if (!validation.valid) {
    failures.push(`Source validation found unsourced claims: ${validation.issues.join("; ")}`);
  }
  if (!signals.noFlaggedClaims) {
    failures.push(`${validation.flaggedClaimCount} claim(s) were downgraded after source-validation retry.`);
  }

  return {
    ...signals,
    passed:
      signals.mentionsFirebaseAlternative &&
      signals.mentionsPostgres &&
      signals.hasAtLeastThreeSpecificSourceClaims &&
      signals.sourceValidationPassed,
  };
}
