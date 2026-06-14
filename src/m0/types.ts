import { z } from "zod";

export type SourceType = "file" | "pr" | "commit" | "readme" | "inferred";

export const SourceCitationSchema = z.object({
  type: z.enum(["file", "pr", "commit", "readme", "inferred"]),
  path: z.string().optional(),
  url: z.string().optional(),
  number: z.number().optional(),
  hash: z.string().optional(),
  excerpt: z.string().optional(),
});

export type SourceCitation = z.infer<typeof SourceCitationSchema>;

export const SourcedClaimSchema = z.object({
  claim: z.string().min(1),
  sources: z.array(SourceCitationSchema).optional().default([]),
  confidence: z.number().min(0).max(1),
});

export type SourcedClaim = z.infer<typeof SourcedClaimSchema>;

export const ArchitectureOutputSchema = z.object({
  purpose: SourcedClaimSchema,
  mainWorkflows: z.array(SourcedClaimSchema).min(1),
  dataModel: SourcedClaimSchema,
  integrations: z.array(SourcedClaimSchema),
  architecturePattern: SourcedClaimSchema,
  claims: z.array(SourcedClaimSchema).min(3),
  confidence: z.number().min(0).max(1),
  flaggedClaims: z.array(SourcedClaimSchema).optional().default([]),
});

export type ArchitectureOutput = z.infer<typeof ArchitectureOutputSchema>;

export interface GitHubRepoMetadata {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  description: string | null;
  htmlUrl: string;
  pushedAt: string | null;
  createdAt: string | null;
}

export interface GitHubTreeFile {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  url: string;
}

export interface CommitSummary {
  sha: string;
  message: string;
  authorName: string;
  date: string;
  htmlUrl: string;
  files: string[];
}

export interface PullRequestSummary {
  number: number;
  title: string;
  body: string;
  mergedAt: string;
  htmlUrl: string;
  labels: string[];
  changedFiles: number;
  comments: number;
  reviewComments: number;
}

export interface AstFileSummary {
  path: string;
  imports: string[];
  exports: string[];
  complexity: number;
  nodeCount: number;
  parseError: boolean;
  source: SourceCitation;
}

export interface RiskFileScore {
  path: string;
  score: number;
  churnCount: number;
  complexity: number;
  incomingDependencies: number;
  hasLikelyTest: boolean;
  evidence: string;
  sources: SourceCitation[];
}

export interface M0IngestionResult {
  repo: GitHubRepoMetadata;
  readme: {
    path: string;
    text: string;
    source: SourceCitation;
  };
  treeFiles: GitHubTreeFile[];
  commits: CommitSummary[];
  pullRequests: PullRequestSummary[];
  astFiles: AstFileSummary[];
  riskScores: RiskFileScore[];
}

export interface SourceValidationResult {
  valid: boolean;
  issues: string[];
  sourcedClaimCount: number;
  specificSourceClaimCount: number;
  flaggedClaimCount: number;
}

export interface M0GateSignals {
  mentionsFirebaseAlternative: boolean;
  mentionsPostgres: boolean;
  hasAtLeastThreeSpecificSourceClaims: boolean;
  noFlaggedClaims: boolean;
  sourceValidationPassed: boolean;
  passed: boolean;
  failures: string[];
}

export interface M0Result {
  generatedAt: string;
  ingestion: {
    repo: GitHubRepoMetadata;
    counts: {
      treeFiles: number;
      commits: number;
      pullRequests: number;
      astFiles: number;
      riskScores: number;
    };
  };
  architecture: ArchitectureOutput;
  validation: SourceValidationResult;
  gateSignals: M0GateSignals;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
