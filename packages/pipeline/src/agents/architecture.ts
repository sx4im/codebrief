import {
  ArchitectureOutputSchema,
  type ArchitectureOutput,
  type FileAstSummary,
  type GitHubRepoRef,
  type PullRequestSummary,
  type RiskFileScore,
  type SourceCitation,
} from "@codebrief/shared";
import type OpenAI from "openai";
import type { PipelineEnv } from "../env.js";
import { callAgent } from "../adapters/nvidia-nim.js";
import { repairArchitecture, validateArchitecture } from "../adapters/source-validation.js";
import type { TechStack } from "../ingestion/tech-stack.js";
import { SCHEMA_GUIDE } from "./schema-guide.js";
import { trimPullRequest } from "./prompt-inputs.js";

export interface ArchitectureInput {
  repo: GitHubRepoRef;
  readme: string;
  documentation: Array<{ path: string; text: string; source: SourceCitation }>;
  fileTree: string[];
  astFiles: FileAstSummary[];
  riskScores: RiskFileScore[];
  pullRequests: PullRequestSummary[];
  techStack: TechStack;
}

export async function runArchitectureAgent(
  client: OpenAI,
  env: PipelineEnv,
  input: ArchitectureInput,
  onTokenUsage?: (tokens: number) => void | Promise<void>,
): Promise<{ output: ArchitectureOutput; tokenUsage: number }> {
  const result = await callAgent(client, {
    model: env.NVIDIA_ARCHITECTURE_MODEL,
    schema: ArchitectureOutputSchema,
    validate: validateArchitecture,
    repair: repairArchitecture,
    onTokenUsage,
    systemPrompt: [
      "You are Codebrief's Architecture Agent.",
      "Return JSON only matching the schema.",
      "Describe the system in business terms, major components, data flows, integrations, and architecture pattern.",
      "Use the detected techStack (package managers, frameworks, primary languages) as ground truth for naming the stack; each entry includes the manifest/config file or dependency that proves it — cite that evidence rather than guessing from file names.",
      "Every claim object must include non-empty usable sources.",
      "Use documentation page source objects directly when claims come from README, docs directories, or uploaded docs artifacts.",
      "If the repository is Supabase and evidence supports it, say it is a Firebase alternative built on Postgres.",
      "Do not invent integrations or features not supported by the input.",
      "integrations are EXTERNAL services/systems only (databases, auth providers, storage, third-party APIs, queues, billing, analytics). Each integration's \"kind\" MUST be exactly one of: database, auth, storage, api, queue, billing, analytics, other. Do NOT list languages, frameworks, UI libraries, or build tools as integrations — describe those in claims instead; if a real external service does not fit a kind, use \"other\".",
      SCHEMA_GUIDE.architecture,
    ].join("\n"),
    // Inputs are truncated to stay well within the model context window (per PRD
    // "truncate intelligently"); oversized requests are rejected by NIM as
    // connection errors. AST summaries and the file tree are the cheapest,
    // highest-signal inputs, so they get the larger budgets.
    userContent: {
      repo: input.repo,
      techStack: input.techStack,
      readme: input.readme.slice(0, 6_000),
      documentation: input.documentation.slice(0, 6).map((page) => ({
        path: page.path,
        source: page.source,
        text: page.text.slice(0, 1_500),
      })),
      fileTree: input.fileTree.slice(0, 400),
      astFiles: input.astFiles.slice(0, 100).map((file) => ({ path: file.path, exports: file.exports.slice(0, 12), imports: file.imports.slice(0, 12), complexity: file.complexity })),
      riskScores: input.riskScores.slice(0, 30),
      pullRequests: input.pullRequests.slice(0, 12).map(trimPullRequest),
    },
  });
  return { output: result.output, tokenUsage: result.tokenUsage };
}
