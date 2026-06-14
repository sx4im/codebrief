import { DecisionSchema, type ArchitectureOutput, type Decision, type IssueSummary, type PullRequestSummary } from "@codebrief/shared";
import type OpenAI from "openai";
import { z } from "zod";
import type { PipelineEnv } from "../env.js";
import { callAgent } from "../adapters/nvidia-nim.js";
import { repairDecisions, validateDecisions } from "../adapters/source-validation.js";
import { SCHEMA_GUIDE } from "./schema-guide.js";
import { trimIssue, trimPullRequest } from "./prompt-inputs.js";

const HistoryOutputSchema = z.object({
  decisions: z.array(DecisionSchema).min(1).max(15),
});

export async function runHistoryAgent(
  client: OpenAI,
  env: PipelineEnv,
  input: { pullRequests: PullRequestSummary[]; issues: IssueSummary[]; architecture: ArchitectureOutput },
  onTokenUsage?: (tokens: number) => void | Promise<void>,
): Promise<{ output: { decisions: Decision[] }; tokenUsage: number }> {
  const result = await callAgent<{ decisions: Decision[] }>(client, {
    model: env.NVIDIA_HISTORY_MODEL,
    schema: HistoryOutputSchema,
    validate: (output) => validateDecisions(output.decisions),
    repair: (output) => ({ decisions: repairDecisions(output.decisions) }),
    onTokenUsage,
    systemPrompt: [
      "You are Codebrief's History Agent.",
      "Identify 5-15 significant architectural decisions from PR titles, PR bodies, review comments, PR discussion comments, linked issues, changed files, commit links, issue discussions, labels, and the architecture output.",
      "Only include decisions with concrete PR, commit, issue, file, readme, or docs evidence.",
      "Prefer direct review-comment or PR-body reasoning over inferred reasoning when both are available.",
      SCHEMA_GUIDE.history,
    ].join("\n"),
    userContent: {
      architecture: input.architecture,
      pullRequests: input.pullRequests.slice(0, 20).map(trimPullRequest),
      issues: input.issues.slice(0, 25).map(trimIssue),
    },
  });
  return { output: result.output, tokenUsage: result.tokenUsage };
}
