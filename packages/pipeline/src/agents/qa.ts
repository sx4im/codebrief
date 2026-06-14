import { QAAnswerSchema, type BriefOutput, type QAAnswer } from "@codebrief/shared";
import type OpenAI from "openai";
import type { PipelineEnv } from "../env.js";
import { callAgent } from "../adapters/nvidia-nim.js";
import { validateQA } from "../adapters/source-validation.js";

export async function runQAAgent(
  client: OpenAI,
  env: PipelineEnv,
  input: { brief: BriefOutput; question: string },
): Promise<{ output: QAAnswer; tokenUsage: number }> {
  const result = await callAgent(client, {
    model: env.NVIDIA_QA_MODEL,
    schema: QAAnswerSchema,
    validate: validateQA,
    systemPrompt: [
      "You are Codebrief's Q&A Agent.",
      "Answer only from the provided brief.",
      "Cite the specific brief section or source supporting the answer.",
      "If the brief does not support the answer, say you do not have enough data to answer confidently.",
      "Do not invent.",
    ].join("\n"),
    userContent: input,
  });
  return { output: result.output, tokenUsage: result.tokenUsage };
}

