import "server-only";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { QAAnswerSchema, type BriefOutput, type QAAnswer, type SourceCitation } from "@codebrief/shared";
import { answerFromBrief } from "@/lib/analysis/repository";
import { collectBriefSourceKeys, validateAnswerGrounding } from "@/lib/ai/qa-grounding";

let qaChain: Promise<unknown> = Promise.resolve();

export async function answerQuestion(input: { brief: BriefOutput; question: string }): Promise<{ answer: QAAnswer; tokenUsage: number; mode: "nvidia" | "fallback" }> {
  const apiKey = process.env.NVIDIA_API_KEY;
  const model = process.env.NVIDIA_QA_MODEL || "meta/llama-3.3-70b-instruct";
  if (!apiKey) return { answer: answerFromBrief(input.brief, input.question), tokenUsage: 0, mode: "fallback" };

  const client = new OpenAI({
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey,
    timeout: Number(process.env.NVIDIA_REQUEST_TIMEOUT_MS) || 120_000,
    maxRetries: Number(process.env.NVIDIA_MAX_RETRIES) || 2,
  });
  const task = qaChain.then(() => callQA(client, model, input));
  qaChain = task.catch(() => undefined);
  return task;
}

async function callQA(
  client: OpenAI,
  model: string,
  input: { brief: BriefOutput; question: string },
): Promise<{ answer: QAAnswer; tokenUsage: number; mode: "nvidia" }> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: [
        "You are Codebrief's Q&A Agent.",
        "Answer only from the provided brief JSON.",
        "Every answer must include non-empty usable sources copied verbatim from the brief.",
        "Do not invent file paths, PR numbers, commits, or any source that is not already present in the brief.",
        "If the brief does not support the answer, the answer field must begin exactly: \"I don't have enough data to answer confidently.\" Cite the closest relevant brief source.",
        "Return JSON only matching: {\"answer\":\"...\",\"sources\":[...],\"confidence\":\"high|medium|low\",\"caveat\":\"optional\"}.",
      ].join("\n"),
    },
    { role: "user", content: JSON.stringify(input) },
  ];

  const briefSourceKeys = collectBriefSourceKeys(input.brief);
  const first = await callJson(client, model, messages);
  let parsed = QAAnswerSchema.safeParse(first.content);
  let answer = parsed.success ? parsed.data : null;
  let issues = answer ? validateAnswer(answer, briefSourceKeys) : ["Response did not match QA answer schema"];
  let tokenUsage = first.tokenUsage;

  if (!answer || issues.length > 0) {
    const retry = await callJson(client, model, [
      ...messages,
      { role: "assistant", content: JSON.stringify(first.content) },
      {
        role: "user",
        content: [
          "Correct the previous response.",
          "Use only sources already present in the brief; do not invent file paths, PR numbers, or commits.",
          "Every source must include a usable path, url, number, hash, excerpt, section, or storageKey.",
          `Validation issues: ${issues.join("; ")}`,
        ].join("\n"),
      },
    ]);
    tokenUsage += retry.tokenUsage;
    parsed = QAAnswerSchema.safeParse(retry.content);
    answer = parsed.success ? parsed.data : null;
    issues = answer ? validateAnswer(answer, briefSourceKeys) : ["Retry did not match QA answer schema"];
  }

  if (!answer || issues.length > 0) {
    const fallback = answerFromBrief(input.brief, input.question);
    return {
      answer: {
        ...fallback,
        confidence: "low",
        caveat: `NVIDIA Q&A response failed source validation: ${issues.join("; ")}`,
      },
      tokenUsage,
      mode: "nvidia",
    };
  }

  return { answer, tokenUsage, mode: "nvidia" };
}

async function callJson(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
): Promise<{ content: unknown; tokenUsage: number }> {
  // Stream like the pipeline agents: NIM can stay silent through a long prefill
  // until the socket read times out; streaming keeps the connection active.
  const { text, tokenUsage } = await retryNvidia(async () => {
    const stream = await client.chat.completions.create({
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.1,
      stream: true,
      stream_options: { include_usage: true },
    });
    let content = "";
    let usage = 0;
    for await (const chunk of stream) {
      content += chunk.choices[0]?.delta?.content ?? "";
      if (chunk.usage?.total_tokens) usage = chunk.usage.total_tokens;
    }
    return { text: content, tokenUsage: usage };
  });
  if (!text) throw new Error(`NVIDIA NIM model ${model} returned an empty response`);
  return { content: JSON.parse(text), tokenUsage };
}

async function retryNvidia<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
      const message = error instanceof Error ? `${error.message} ${error instanceof Error && error.cause instanceof Error ? error.cause.message : ""}`.toLowerCase() : String(error).toLowerCase();
      const recoverable = status === 429 || status >= 500 || /etimedout|econnreset|connection error|fetch failed|socket hang up|timed out|timeout/.test(message);
      if (!recoverable || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
    }
  }
  throw new Error("unreachable retry state");
}

function validateAnswer(answer: QAAnswer, briefSourceKeys: Set<string>): string[] {
  return [...validateSources(answer.sources), ...validateAnswerGrounding(answer, briefSourceKeys)];
}

function validateSources(sources: SourceCitation[]): string[] {
  const issues: string[] = [];
  if (sources.length === 0) issues.push("Answer has no sources");
  sources.forEach((source, index) => {
    const hasUsableReference = Boolean(source.path || source.url || source.number || source.hash || source.excerpt || source.section || source.storageKey);
    if (!hasUsableReference) issues.push(`Source ${index + 1} has no usable reference`);
  });
  return issues;
}
