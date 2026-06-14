import type {
  ArchitectureDiagram,
  ArchitectureOutput,
  BriefOutput,
  Decision,
  Landmine,
  RepoStats,
  SynthesisOutput,
} from "@codebrief/shared";

export function assembleBrief(input: {
  id: string;
  analysisId: string;
  repoFullName: string;
  createdAt: string;
  architecture: ArchitectureOutput;
  decisions: Decision[];
  landmines: Landmine[];
  synthesis: SynthesisOutput;
  diagram: ArchitectureDiagram;
  repoStats: RepoStats;
  modelVersions: Record<string, string>;
}): BriefOutput {
  return {
    id: input.id,
    analysisId: input.analysisId,
    repoFullName: input.repoFullName,
    createdAt: input.createdAt,
    systemNarrative: input.architecture,
    decisions: input.decisions,
    landmines: input.landmines,
    assessment: input.synthesis.rewriteAssessment,
    topFindings: input.synthesis.topFindings,
    architectureDiagram: input.diagram,
    repoStats: input.repoStats,
    modelVersions: input.modelVersions,
    flaggedClaims: [...input.architecture.flaggedClaims, ...input.synthesis.flaggedClaims],
  };
}
