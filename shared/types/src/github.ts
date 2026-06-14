import { z } from "zod";

export const GitHubRepoRefSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  fullName: z.string().min(1),
  defaultBranch: z.string().min(1),
  htmlUrl: z.string().url(),
  isPrivate: z.boolean(),
  createdAt: z.string().optional(),
  pushedAt: z.string().optional(),
});

export type GitHubRepoRef = z.infer<typeof GitHubRepoRefSchema>;

export const GitHubTreeFileSchema = z.object({
  path: z.string().min(1),
  mode: z.string(),
  type: z.enum(["blob", "tree", "commit"]),
  sha: z.string().min(1),
  size: z.number().int().nonnegative().optional(),
  url: z.string().url(),
});

export type GitHubTreeFile = z.infer<typeof GitHubTreeFileSchema>;

export const CommitSummarySchema = z.object({
  sha: z.string().min(1),
  message: z.string(),
  authorName: z.string(),
  date: z.string(),
  htmlUrl: z.string().url(),
  files: z.array(z.string()),
});

export type CommitSummary = z.infer<typeof CommitSummarySchema>;

export const PullRequestSummarySchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  mergedAt: z.string(),
  htmlUrl: z.string().url(),
  labels: z.array(z.string()),
  changedFiles: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  reviewComments: z.number().int().nonnegative(),
  changedFilePaths: z.array(z.string()).optional(),
  commitShas: z.array(z.string()).optional(),
  linkedIssueNumbers: z.array(z.number().int().positive()).optional(),
  iterationCount: z.number().int().nonnegative().optional(),
  reviewCommentDetails: z
    .array(
      z.object({
        body: z.string(),
        path: z.string().optional(),
        commitSha: z.string().optional(),
        htmlUrl: z.string().url().optional(),
        author: z.string().optional(),
        createdAt: z.string().optional(),
      }),
    )
    .optional(),
  discussionComments: z
    .array(
      z.object({
        body: z.string(),
        htmlUrl: z.string().url().optional(),
        author: z.string().optional(),
        createdAt: z.string().optional(),
      }),
    )
    .optional(),
});

export type PullRequestSummary = z.infer<typeof PullRequestSummarySchema>;

export const IssueSummarySchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  state: z.enum(["open", "closed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable(),
  htmlUrl: z.string().url(),
  labels: z.array(z.string()),
  comments: z.number().int().nonnegative(),
});

export type IssueSummary = z.infer<typeof IssueSummarySchema>;

export const FileAstSummarySchema = z.object({
  path: z.string().min(1),
  imports: z.array(z.string()),
  exports: z.array(z.string()),
  complexity: z.number().int().positive(),
  nodeCount: z.number().int().nonnegative(),
  parseError: z.boolean(),
});

export type FileAstSummary = z.infer<typeof FileAstSummarySchema>;

export const RiskFileScoreSchema = z.object({
  path: z.string().min(1),
  score: z.number().min(0),
  churnCount: z.number().int().nonnegative(),
  complexity: z.number().int().positive(),
  incomingDependencies: z.number().int().nonnegative(),
  hasLikelyTest: z.boolean(),
  evidence: z.string().min(1),
});

export type RiskFileScore = z.infer<typeof RiskFileScoreSchema>;
