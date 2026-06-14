import { z } from "zod";

export const SourceCitationSchema = z.object({
  type: z.enum(["file", "pr", "issue", "commit", "readme", "docs", "dependency", "metric", "brief", "inferred"]),
  path: z.string().optional(),
  url: z.string().url().optional(),
  number: z.number().int().positive().optional(),
  hash: z.string().optional(),
  excerpt: z.string().optional(),
  section: z.string().optional(),
  storageKey: z.string().optional(),
});

export type SourceCitation = z.infer<typeof SourceCitationSchema>;

export const SourcedClaimSchema = z.object({
  claim: z.string().min(1),
  sources: z.array(SourceCitationSchema).default([]),
  confidence: z.number().min(0).max(1),
});

export type SourcedClaim = z.infer<typeof SourcedClaimSchema>;

export const WorkflowItemSchema = SourcedClaimSchema.extend({
  name: z.string().min(1),
});

export type WorkflowItem = z.infer<typeof WorkflowItemSchema>;

export const IntegrationSchema = SourcedClaimSchema.extend({
  name: z.string().min(1),
  kind: z.enum(["database", "auth", "storage", "api", "queue", "billing", "analytics", "other"]),
});

export type Integration = z.infer<typeof IntegrationSchema>;

export const ArchitectureOutputSchema = z.object({
  purpose: SourcedClaimSchema,
  mainWorkflows: z.array(WorkflowItemSchema).min(1),
  dataModel: SourcedClaimSchema,
  integrations: z.array(IntegrationSchema),
  architecturePattern: SourcedClaimSchema,
  claims: z.array(SourcedClaimSchema).min(3),
  confidence: z.number().min(0).max(1),
  flaggedClaims: z.array(SourcedClaimSchema).default([]),
});

export type ArchitectureOutput = z.infer<typeof ArchitectureOutputSchema>;

export const DecisionSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  context: z.string().min(1),
  evidence: z.array(SourceCitationSchema).min(1),
  assessment: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export type Decision = z.infer<typeof DecisionSchema>;

export const LandmineCategorySchema = z.enum([
  "churn-trap",
  "coupling-cluster",
  "dependency-debt",
  "complexity-bomb",
  "knowledge-silo",
  "silent-assumption",
]);

export type LandmineCategory = z.infer<typeof LandmineCategorySchema>;

export const SeveritySchema = z.enum(["critical", "high", "medium", "low"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const LandmineSchema = z.object({
  location: z.string().min(1),
  category: LandmineCategorySchema,
  severity: SeveritySchema,
  evidence: z.array(SourceCitationSchema).min(1),
  explanation: z.string().min(1),
  remediation: z.string().min(1),
  remediationEstimate: z.string().min(1),
  priority: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
});

export type Landmine = z.infer<typeof LandmineSchema>;

export const RewriteAssessmentSchema = z.object({
  verdict: z.enum(["build-on", "partial-rewrite", "full-rewrite"]),
  reasons: z.array(SourcedClaimSchema).min(3),
  risks: z.array(SourcedClaimSchema).min(1),
  confidence: z.number().min(0).max(1),
  uncertainty: z.string().min(1),
});

export type RewriteAssessment = z.infer<typeof RewriteAssessmentSchema>;

export const FindingSchema = SourcedClaimSchema.extend({
  title: z.string().min(1),
  severity: SeveritySchema,
});

export type Finding = z.infer<typeof FindingSchema>;

export const SynthesisOutputSchema = z.object({
  narrative: z.string().min(100),
  rewriteAssessment: RewriteAssessmentSchema,
  topFindings: z.array(FindingSchema).min(1).max(3),
  claims: z.array(SourcedClaimSchema).min(1),
  flaggedClaims: z.array(SourcedClaimSchema).default([]),
});

export type SynthesisOutput = z.infer<typeof SynthesisOutputSchema>;

export const QAAnswerSchema = z.object({
  answer: z.string().min(1),
  sources: z.array(SourceCitationSchema).min(1),
  confidence: z.enum(["high", "medium", "low"]),
  caveat: z.string().optional(),
});

export type QAAnswer = z.infer<typeof QAAnswerSchema>;

export const QAConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  sources: z.array(SourceCitationSchema).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  caveat: z.string().optional(),
  error: z.boolean().optional(),
  timestamp: z.string().min(1),
});

export type QAConversationMessage = z.infer<typeof QAConversationMessageSchema>;

export const DiagramNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  path: z.string().min(1),
  severity: SeveritySchema.optional(),
  landmineCount: z.number().int().nonnegative().default(0),
});

export type DiagramNode = z.infer<typeof DiagramNodeSchema>;

export const DiagramEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  kind: z.enum(["dependency", "coupling"]),
  // For dependency edges, the number of underlying file-level imports between the
  // two modules; for coupling edges, the strongest co-change count. Optional so
  // older persisted briefs without weights still parse.
  weight: z.number().int().positive().optional(),
});

export type DiagramEdge = z.infer<typeof DiagramEdgeSchema>;

export const ArchitectureDiagramSchema = z.object({
  nodes: z.array(DiagramNodeSchema),
  edges: z.array(DiagramEdgeSchema),
});

export type ArchitectureDiagram = z.infer<typeof ArchitectureDiagramSchema>;

export const RepoStatsSchema = z.object({
  fileCount: z.number().int().nonnegative(),
  languageBreakdown: z.record(z.number().int().nonnegative()),
  commitCount: z.number().int().nonnegative(),
  pullRequestCount: z.number().int().nonnegative(),
  contributorCount: z.number().int().nonnegative(),
  repoAgeDays: z.number().int().nonnegative().optional(),
  commitsPerMonth: z.number().nonnegative().optional(),
});

export type RepoStats = z.infer<typeof RepoStatsSchema>;

export const BriefOutputSchema = z.object({
  id: z.string().min(1),
  analysisId: z.string().min(1),
  repoFullName: z.string().min(1),
  createdAt: z.string().min(1),
  systemNarrative: ArchitectureOutputSchema,
  decisions: z.array(DecisionSchema),
  landmines: z.array(LandmineSchema),
  assessment: RewriteAssessmentSchema,
  topFindings: z.array(FindingSchema),
  architectureDiagram: ArchitectureDiagramSchema,
  repoStats: RepoStatsSchema,
  modelVersions: z.record(z.string()),
  flaggedClaims: z.array(SourcedClaimSchema).default([]),
});

export type BriefOutput = z.infer<typeof BriefOutputSchema>;
