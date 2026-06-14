import { LandmineSchema, type ArchitectureOutput, type Landmine, type RiskFileScore } from "@codebrief/shared";
import type OpenAI from "openai";
import { z } from "zod";
import type { CouplingCluster } from "../analysis/coupling.js";
import type { KnowledgeSilo } from "../analysis/silos.js";
import type { ComplexityBomb } from "../analysis/complexity.js";
import type { StaleHotspot } from "../analysis/recency.js";
import type { DependencyFinding } from "../ingestion/deps.js";
import type { PipelineEnv } from "../env.js";
import { callAgent } from "../adapters/nvidia-nim.js";
import { repairLandmines, validateLandmines } from "../adapters/source-validation.js";
import { SCHEMA_GUIDE } from "./schema-guide.js";

const RiskOutputSchema = z.object({
  landmines: z.array(LandmineSchema).min(1),
});

export async function runRiskAgent(
  client: OpenAI,
  env: PipelineEnv,
  input: {
    riskScores: RiskFileScore[];
    couplingClusters: CouplingCluster[];
    silos: KnowledgeSilo[];
    complexityBombs: ComplexityBomb[];
    staleHotspots: StaleHotspot[];
    dependencies: DependencyFinding[];
    architecture: ArchitectureOutput;
  },
  onTokenUsage?: (tokens: number) => void | Promise<void>,
): Promise<{ output: { landmines: Landmine[] }; tokenUsage: number }> {
  const result = await callAgent<{ landmines: Landmine[] }>(client, {
    model: env.NVIDIA_RISK_MODEL,
    schema: RiskOutputSchema,
    validate: (output) => validateLandmines(output.landmines),
    repair: (output) => ({ landmines: repairLandmines(output.landmines) }),
    onTokenUsage,
    systemPrompt: [
      "You are Codebrief's Risk Agent.",
      "Produce a ranked landmine map specific to this repository.",
      "Every landmine must name a concrete file, module, or dependency and include non-empty evidence.",
      "At least 3 landmines MUST name a specific source FILE — a path that includes the file's extension (e.g. \"pkg/foo/bar.go\", \"lib/action_mailer/base.rb\") — drawn from the risk scores, complexity bombs, coupling clusters, stale hotspots, and silos. Prefer these file-level landmines.",
      "Use dependency-debt landmines (which name a package, not a file) only as ADDITIONAL items beyond those 3 file-level landmines, never as a substitute.",
      "Use only provided risk scores, coupling clusters, silos, complexity bombs, stale hotspots, dependencies, and architecture context.",
      "Treat complexity bombs (high-complexity files the rest of the system depends on) as high-priority landmines.",
      "Treat stale hotspots (load-bearing files not modified in over a year) as maintenance-risk landmines.",
      "For knowledge silos, escalate severity when the dominant author is inactive (authorActive=false): the knowledge may have already left the team.",
      "Do not add generic risks.",
      SCHEMA_GUIDE.risk,
    ].join("\n"),
    // Cap the raw signals to stay within the model context window. The highest-risk
    // files, strongest clusters, and flagged dependencies carry the signal; the long
    // tail does not change the landmine map.
    userContent: {
      riskScores: input.riskScores.slice(0, 80),
      couplingClusters: input.couplingClusters.slice(0, 40),
      silos: input.silos.slice(0, 40),
      complexityBombs: input.complexityBombs.slice(0, 40),
      staleHotspots: input.staleHotspots.slice(0, 40),
      dependencies: prioritizeDependencies(input.dependencies).slice(0, 120).map(trimDependency),
      architecture: input.architecture,
    },
  });
  return { output: result.output, tokenUsage: result.tokenUsage };
}

// Flagged dependencies (vulnerable/outdated/abandoned) are the ones that become
// landmines, so surface them first when the list is truncated.
function prioritizeDependencies(dependencies: DependencyFinding[]): DependencyFinding[] {
  return [...dependencies].sort((a, b) => b.flags.length - a.flags.length);
}

function trimDependency(dependency: DependencyFinding): DependencyFinding {
  return {
    ...dependency,
    vulnerabilities: dependency.vulnerabilities.slice(0, 3).map((vulnerability) => ({ ...vulnerability, summary: vulnerability.summary.slice(0, 200) })),
  };
}
