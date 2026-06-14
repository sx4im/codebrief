import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z, type ZodTypeAny } from "zod";
import type { PipelineEnv } from "../env.js";
import { requireEnv } from "../env.js";
import type { ValidationResult } from "./source-validation.js";

export interface AgentCallResult<T> {
  output: T;
  tokenUsage: number;
  validation: ValidationResult;
}

export interface AgentCallOptions<T> {
  model: string;
  systemPrompt: string;
  userContent: unknown;
  schema: ZodTypeAny;
  validate: (output: T) => ValidationResult;
  repair?: (output: T, validation: ValidationResult) => T;
  /**
   * Invoked with the token count of each individual NVIDIA NIM call as soon as
   * the completion returns, before parsing or source validation can throw. This
   * lets callers persist usage incrementally so tokens consumed by a run that
   * later fails are still accounted for.
   */
  onTokenUsage?: (tokens: number) => void | Promise<void>;
}

let agentChain: Promise<unknown> = Promise.resolve();

export function createNvidiaClient(env: PipelineEnv): OpenAI {
  return new OpenAI({
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey: requireEnv(env.NVIDIA_API_KEY, "NVIDIA_API_KEY"),
    timeout: env.NVIDIA_REQUEST_TIMEOUT_MS,
    maxRetries: env.NVIDIA_MAX_RETRIES,
  });
}

export async function callAgent<T>(
  client: OpenAI,
  options: AgentCallOptions<T>,
): Promise<AgentCallResult<T>> {
  const task = agentChain.then(() => callAgentInner(client, options));
  agentChain = task.catch(() => undefined);
  return task;
}

async function callAgentInner<T>(client: OpenAI, options: AgentCallOptions<T>): Promise<AgentCallResult<T>> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: options.systemPrompt,
    },
    {
      role: "user",
      content: JSON.stringify(options.userContent),
    },
  ];
  const first = await callJson(client, options.model, messages, options.onTokenUsage);
  let tokenUsage = first.tokenUsage;

  // Schema-shape correction: if the model's JSON does not match the schema (wrong
  // field, bad enum value, missing key), feed the exact Zod errors back once. Models
  // reliably fix these when told precisely what was wrong, so this avoids failing a
  // whole analysis on a single malformed enum.
  let parsed = options.schema.safeParse(first.content);
  let rawContent: unknown = first.content;
  if (!parsed.success) {
    const corrected = await callJson(client, options.model, [
      ...messages,
      { role: "assistant", content: JSON.stringify(first.content) },
      {
        role: "user",
        content: [
          "Your previous JSON did not match the required schema.",
          "Return corrected JSON using exactly the required fields and only the allowed enum values shown in the instructions.",
          `Schema errors: ${JSON.stringify(parsed.error.issues)}`,
        ].join("\n"),
      },
    ], options.onTokenUsage);
    tokenUsage += corrected.tokenUsage;
    rawContent = corrected.content;
    parsed = options.schema.safeParse(corrected.content);
    if (!parsed.success) {
      throw new Error(`Agent output failed schema validation after retry: ${JSON.stringify(parsed.error.issues)}`);
    }
  }

  let output = parsed.data as T;
  let validation = options.validate(output);

  if (!validation.valid || validation.flaggedClaimCount > 0) {
    const second = await callJson(client, options.model, [
      ...messages,
      { role: "assistant", content: JSON.stringify(rawContent) },
      {
        role: "user",
        content: [
          "Your previous JSON failed source validation.",
          "Return corrected JSON matching the same schema.",
          "Every claim, decision, landmine, assessment reason, finding, and answer must include non-empty usable sources.",
          `Validation issues: ${validation.issues.join("; ")}`,
        ].join("\n"),
      },
    ], options.onTokenUsage);
    tokenUsage += second.tokenUsage;
    // Keep the source-corrected output only if it still parses; otherwise retain the
    // schema-valid output from before and let repair/downgrade handle the sources.
    const reparsed = options.schema.safeParse(second.content);
    if (reparsed.success) {
      output = reparsed.data as T;
      validation = options.validate(output);
    }
    if ((!validation.valid || validation.flaggedClaimCount > 0) && options.repair) {
      output = options.repair(output, validation);
      validation = options.validate(output);
    }
  }

  if (!validation.valid) {
    throw new Error(`Agent output failed source validation: ${validation.issues.join("; ")}`);
  }

  return { output, tokenUsage, validation };
}

async function callJson(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  onTokenUsage?: (tokens: number) => void | Promise<void>,
): Promise<{ content: unknown; tokenUsage: number }> {
  // Stream the completion. NIM can take >2 minutes to begin emitting a response
  // for a large request; a non-streamed read leaves the socket silent and the OS
  // kills it with `read ETIMEDOUT`. Streaming delivers tokens as they are produced,
  // keeping the connection active so long generations complete reliably.
  const { text, tokenUsage } = await retry429(() => streamCompletion(client, model, messages));
  // Report usage before the empty-response and JSON.parse checks below: NVIDIA
  // bills for the call regardless of whether the body is usable, so a run that
  // throws on a bad response must still account for the tokens it consumed.
  if (onTokenUsage && tokenUsage > 0) {
    try {
      await onTokenUsage(tokenUsage);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[nvidia-nim] token usage accounting failed: ${message}\n`);
    }
  }
  if (!text) {
    throw new Error(`NVIDIA NIM model ${model} returned an empty response`);
  }
  return {
    content: JSON.parse(text),
    tokenUsage,
  };
}

async function streamCompletion(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
): Promise<{ text: string; tokenUsage: number }> {
  const stream = await client.chat.completions.create({
    model,
    messages,
    response_format: { type: "json_object" },
    temperature: 0.1,
    stream: true,
    stream_options: { include_usage: true },
  });
  let text = "";
  let tokenUsage = 0;
  for await (const chunk of stream) {
    text += chunk.choices[0]?.delta?.content ?? "";
    if (chunk.usage?.total_tokens) tokenUsage = chunk.usage.total_tokens;
  }
  return { text, tokenUsage };
}

async function retry429<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      // Retry on rate limits (429), 5xx, and transient connection failures. NIM can
      // be silent during a long prefill until the socket read times out
      // (`read ETIMEDOUT`); a fresh connection usually clears the queue and starts
      // streaming in time. Only these recoverable errors are retried.
      const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
      const recoverable = status === 429 || status >= 500 || isTransientConnectionError(error);
      if (!recoverable || attempt === 4) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
    }
  }
  throw new Error("unreachable retry state");
}

function isTransientConnectionError(error: unknown): boolean {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.name, current.message);
      if ("code" in current && typeof current.code === "string") parts.push(current.code);
      current = (current as { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  const haystack = parts.join(" ").toLowerCase();
  return /etimedout|econnreset|econnrefused|eai_again|enotfound|socket hang up|connection error|fetch failed|terminated|timed out|timeout/.test(haystack);
}

export const TokenUsageSchema = z.object({
  total: z.number().int().nonnegative(),
});
