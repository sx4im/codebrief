import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { M0Config } from "./config.js";
import {
  parseArchitectureOutput,
  validateArchitectureSources,
  downgradeUnsourcedClaims,
} from "./source-validation.js";
import type { ArchitectureOutput, M0IngestionResult } from "./types.js";

export interface ArchitectureAgentResult {
  output: ArchitectureOutput;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface AgentJsonResponse {
  content: unknown;
  usage: ArchitectureAgentResult["tokenUsage"];
}

export async function runArchitectureAgent(
  config: M0Config,
  ingestion: M0IngestionResult,
): Promise<ArchitectureAgentResult> {
  const client = new OpenAI({
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey: config.nvidiaApiKey,
  });

  const messages = buildArchitectureMessages(ingestion);
  const first = await callJson(client, config.models.architecture, messages);
  return enforceArchitectureSources(first, async (validationIssues) => {
    const correctionMessages = buildCorrectionMessages(messages, first.content, validationIssues);
    return callJson(client, config.models.architecture, correctionMessages);
  });
}

export async function enforceArchitectureSources(
  first: AgentJsonResponse,
  correctionCall: (validationIssues: string[]) => Promise<AgentJsonResponse>,
): Promise<ArchitectureAgentResult> {
  let parsed = parseArchitectureOutput(first.content);
  let validation = validateArchitectureSources(parsed);

  if (!validation.valid) {
    const second = await correctionCall(validation.issues);
    parsed = parseArchitectureOutput(second.content);
    validation = validateArchitectureSources(parsed);
    if (!validation.valid) {
      parsed = downgradeUnsourcedClaims(parsed);
    }
    return {
      output: parsed,
      tokenUsage: addUsage(first.usage, second.usage),
    };
  }

  return {
    output: parsed,
    tokenUsage: first.usage,
  };
}

function buildCorrectionMessages(
  originalMessages: ChatCompletionMessageParam[],
  previousContent: unknown,
  validationIssues: string[],
): ChatCompletionMessageParam[] {
  return [
    ...originalMessages,
    {
      role: "assistant",
      content: JSON.stringify(previousContent),
    },
    {
      role: "user",
      content: [
        "Your previous JSON contained unsourced claims or invalid source citations.",
        "Return the same schema again, but every claim object must have a non-empty sources array with usable references.",
        "Use only file, readme, PR, commit, or inferred sources present in the input.",
        `Validation issues: ${validationIssues.join("; ")}`,
      ].join("\n"),
    },
  ];
}

function buildArchitectureMessages(ingestion: M0IngestionResult): ChatCompletionMessageParam[] {
  const compactInput = {
    repo: ingestion.repo,
    readme: {
      source: ingestion.readme.source,
      excerpt: ingestion.readme.text.slice(0, 16_000),
    },
    fileTreeSample: compactFileTree(ingestion.treeFiles.map((file) => file.path)),
    astFiles: ingestion.astFiles.slice(0, 80),
    riskScores: ingestion.riskScores.slice(0, 30),
    recentPullRequests: ingestion.pullRequests.slice(0, 30),
    recentCommits: ingestion.commits.slice(0, 40),
  };

  return [
    {
      role: "system",
      content: [
        "You are Codebrief's Architecture Agent.",
        "Describe the repository in business terms for a new technical owner.",
        "Return JSON only. Do not wrap it in markdown.",
        "Every claim object must include a non-empty sources array.",
        "Use only these source types: file, readme, pr, commit, inferred.",
        "Prefer specific file paths, README path, PR URLs, or commit hashes over inferred sources.",
        "Do not name integrations, data stores, or features unless the input evidence supports them.",
        "If evidence supports it, explicitly state whether Supabase is a Firebase alternative and whether Postgres is central to the system.",
        "The JSON schema is:",
        JSON.stringify({
          purpose: { claim: "string", sources: [{ type: "readme", path: "README.md" }], confidence: 0.9 },
          mainWorkflows: [{ claim: "string", sources: [{ type: "file", path: "path/to/file.ts" }], confidence: 0.8 }],
          dataModel: { claim: "string", sources: [{ type: "file", path: "path/to/file.ts" }], confidence: 0.8 },
          integrations: [{ claim: "string", sources: [{ type: "file", path: "path/to/file.ts" }], confidence: 0.7 }],
          architecturePattern: { claim: "string", sources: [{ type: "inferred", excerpt: "inferred from module structure" }], confidence: 0.6 },
          claims: [{ claim: "string", sources: [{ type: "pr", url: "https://github.com/..." }], confidence: 0.8 }],
          confidence: 0.8,
          flaggedClaims: [],
        }),
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify(compactInput),
    },
  ];
}

async function callJson(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
): Promise<AgentJsonResponse> {
  const completion = await retry429(async () =>
    client.chat.completions.create({
      model,
      messages,
      temperature: 0.1,
      response_format: { type: "json_object" },
      stream: false,
    }),
  );
  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error("NVIDIA NIM returned an empty architecture-agent response");
  }
  return {
    content: JSON.parse(content),
    usage: {
      promptTokens: completion.usage?.prompt_tokens || 0,
      completionTokens: completion.usage?.completion_tokens || 0,
      totalTokens: completion.usage?.total_tokens || 0,
    },
  };
}

async function retry429<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
      if (status !== 429 || attempt >= 4) {
        throw error;
      }
      const waitMs = 2 ** attempt * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      attempt += 1;
    }
  }
}

function addUsage(
  a: ArchitectureAgentResult["tokenUsage"],
  b: ArchitectureAgentResult["tokenUsage"],
): ArchitectureAgentResult["tokenUsage"] {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

function compactFileTree(paths: string[]): string[] {
  const interesting = paths.filter((filePath) => {
    if (/\/(node_modules|dist|build|coverage|vendor)\//.test(filePath)) {
      return false;
    }
    return filePath.split("/").length <= 4 || /^(README|docs\/|apps\/|packages\/)/.test(filePath);
  });
  return interesting.slice(0, 1200);
}
