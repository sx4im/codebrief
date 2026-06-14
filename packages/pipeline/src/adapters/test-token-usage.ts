import type OpenAI from "openai";
import { z } from "zod";
import { callAgent } from "./nvidia-nim.js";
import type { ValidationResult } from "./source-validation.js";

// Verifies that callAgent reports token usage after each individual NVIDIA NIM
// call via onTokenUsage, so a run that ultimately fails still accounts for the
// tokens it consumed (the incremental-accounting trust boundary).

const schema = z.object({ ok: z.boolean() });
type Out = z.infer<typeof schema>;

function validate(output: Out): ValidationResult {
  return { valid: output.ok, issues: output.ok ? [] : ["not ok"], flaggedClaimCount: 0 };
}

function mockClient(responses: Array<{ ok: boolean; total_tokens: number }>): OpenAI {
  let index = 0;
  return {
    chat: {
      completions: {
        // callJson streams, so the mock yields an async-iterable of chunks: a
        // content delta followed by a final usage chunk (stream_options.include_usage).
        create: async () => {
          const response = responses[Math.min(index, responses.length - 1)];
          index += 1;
          if (!response) throw new Error("mock client has no responses configured");
          const content = JSON.stringify({ ok: response.ok });
          return (async function* () {
            yield { choices: [{ delta: { content } }] };
            yield { choices: [{ delta: {} }], usage: { total_tokens: response.total_tokens } };
          })();
        },
      },
    },
  } as unknown as OpenAI;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// 1. Valid first response: exactly one NVIDIA call, one usage event.
{
  const usage: number[] = [];
  const result = await callAgent<Out>(mockClient([{ ok: true, total_tokens: 11 }]), {
    model: "m",
    systemPrompt: "s",
    userContent: {},
    schema,
    validate,
    onTokenUsage: (tokens) => {
      usage.push(tokens);
    },
  });
  assert(result.output.ok === true, "expected valid output");
  assert(result.tokenUsage === 11, `expected tokenUsage 11, got ${result.tokenUsage}`);
  assert(JSON.stringify(usage) === JSON.stringify([11]), `expected one usage event [11], got ${JSON.stringify(usage)}`);
}

// 2. Invalid then valid: correction retry runs, usage reported for both calls.
{
  const usage: number[] = [];
  const result = await callAgent<Out>(
    mockClient([
      { ok: false, total_tokens: 7 },
      { ok: true, total_tokens: 5 },
    ]),
    {
      model: "m",
      systemPrompt: "s",
      userContent: {},
      schema,
      validate,
      onTokenUsage: (tokens) => {
        usage.push(tokens);
      },
    },
  );
  assert(result.tokenUsage === 12, `expected combined tokenUsage 12, got ${result.tokenUsage}`);
  assert(JSON.stringify(usage) === JSON.stringify([7, 5]), `expected usage [7,5], got ${JSON.stringify(usage)}`);
}

// 3. Invalid both times with no repair: callAgent throws, but both NVIDIA calls
//    are still accounted for. This is the failed-run accounting guarantee.
{
  const usage: number[] = [];
  let threw = false;
  try {
    await callAgent<Out>(
      mockClient([
        { ok: false, total_tokens: 9 },
        { ok: false, total_tokens: 4 },
      ]),
      {
        model: "m",
        systemPrompt: "s",
        userContent: {},
        schema,
        validate,
        onTokenUsage: (tokens) => {
          usage.push(tokens);
        },
      },
    );
  } catch {
    threw = true;
  }
  assert(threw, "expected callAgent to throw when output never passes validation");
  assert(
    JSON.stringify(usage) === JSON.stringify([9, 4]),
    `expected usage accounted for both failed calls [9,4], got ${JSON.stringify(usage)}`,
  );
}

// 4. A failing onTokenUsage callback must not break an otherwise valid call.
{
  const result = await callAgent<Out>(mockClient([{ ok: true, total_tokens: 3 }]), {
    model: "m",
    systemPrompt: "s",
    userContent: {},
    schema,
    validate,
    onTokenUsage: () => {
      throw new Error("simulated token-accounting failure");
    },
  });
  assert(result.output.ok === true, "expected valid output despite accounting failure");
  assert(result.tokenUsage === 3, `expected tokenUsage 3, got ${result.tokenUsage}`);
}

process.stdout.write("token usage accounting tests passed\n");
