import { z } from "zod";

export const PipelineStageNameSchema = z.enum([
  "ingest:repo",
  "ingest:ast",
  "ingest:git",
  "ingest:github-api",
  "ingest:deps",
  "ingest:docs",
  "analyze:risk-scores",
  "analyze:coupling",
  "analyze:silos",
  "analyze:complexity",
  "agent:architecture",
  "agent:history",
  "agent:risk",
  "agent:synthesis",
  "output:diagram",
  "output:brief",
  "complete",
]);

export type PipelineStageName = z.infer<typeof PipelineStageNameSchema>;

export const PIPELINE_STAGES: PipelineStageName[] = PipelineStageNameSchema.options;

export const PipelineStageStatusSchema = z.enum(["pending", "running", "done", "failed"]);
export type PipelineStageStatus = z.infer<typeof PipelineStageStatusSchema>;

export const AnalysisStatusSchema = z.enum(["pending", "ingesting", "analyzing", "generating", "complete", "failed"]);
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;

export const AnalysisScopeSchema = z.enum(["quick", "full"]);
export type AnalysisScope = z.infer<typeof AnalysisScopeSchema>;

export const AnalysisConfigSchema = z.object({
  scope: AnalysisScopeSchema.default("quick"),
  scopeCommits: z.number().int().positive().default(100),
  scopePullRequests: z.number().int().positive().default(50),
  scopeIssues: z.number().int().positive().default(100),
  includePrivate: z.boolean().default(false),
  docsArtifactKey: z.string().optional(),
  issueCsvArtifactKey: z.string().optional(),
  retryOfAnalysisId: z.string().uuid().optional(),
  retryFromStage: PipelineStageNameSchema.optional(),
});

export type AnalysisConfig = z.infer<typeof AnalysisConfigSchema>;

export const StartAnalysisPayloadSchema = z.object({
  projectId: z.string().uuid(),
  config: AnalysisConfigSchema,
});

export type StartAnalysisPayload = z.infer<typeof StartAnalysisPayloadSchema>;

export const AnalysisJobPayloadSchema = StartAnalysisPayloadSchema.extend({
  analysisId: z.string().uuid(),
  userId: z.string().min(1),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
  repoUrl: z.string().url(),
  githubToken: z.string().optional(),
});

export type AnalysisJobPayload = z.infer<typeof AnalysisJobPayloadSchema>;

export const StageEventSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("stage_start"),
    analysisId: z.string(),
    stage: PipelineStageNameSchema,
    message: z.string(),
  }),
  z.object({
    event: z.literal("stage_progress"),
    analysisId: z.string(),
    stage: PipelineStageNameSchema,
    message: z.string(),
    percent: z.number().min(0).max(100),
  }),
  z.object({
    event: z.literal("stage_complete"),
    analysisId: z.string(),
    stage: PipelineStageNameSchema,
    outputSummary: z.string(),
  }),
  z.object({
    event: z.literal("stage_failed"),
    analysisId: z.string(),
    stage: PipelineStageNameSchema,
    error: z.string(),
  }),
  z.object({
    event: z.literal("analysis_complete"),
    analysisId: z.string(),
    briefId: z.string(),
  }),
  z.object({
    event: z.literal("analysis_failed"),
    analysisId: z.string(),
    error: z.string(),
  }),
]);

export type StageEvent = z.infer<typeof StageEventSchema>;
