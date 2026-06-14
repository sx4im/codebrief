import assert from "node:assert/strict";
import type { QAAnswer } from "@codebrief/shared";
import { sampleBrief } from "@/lib/sample-data";
import { collectBriefSourceKeys, sourceKey, validateAnswerGrounding } from "./qa-grounding";

const keys = collectBriefSourceKeys(sampleBrief);

// Brief sources are collected. Derive a real file source from the brief itself
// (the demo brief is a live analysis, so specific paths are not hardcoded here).
const realFileSource = [...sampleBrief.landmines.flatMap((landmine) => landmine.evidence), ...sampleBrief.systemNarrative.claims.flatMap((claim) => claim.sources)].find(
  (source) => source.type === "file" && Boolean(source.path),
);
assert.ok(realFileSource, "brief should contain at least one file evidence source");
assert.ok(keys.has(sourceKey(realFileSource)), "brief file source should be collected");

// An answer citing a real brief source is grounded.
const grounded: QAAnswer = { answer: "Grounded in a real brief source.", sources: [realFileSource], confidence: "high" };
assert.deepEqual(validateAnswerGrounding(grounded, keys), [], "grounded answer should have no grounding issues");

// A fabricated file path is rejected (the core anti-hallucination guard).
const fabricatedFile: QAAnswer = {
  answer: "The auth flow lives here.",
  sources: [{ type: "file", path: "src/totally/made-up.ts" }],
  confidence: "high",
};
assert.equal(validateAnswerGrounding(fabricatedFile, keys).length, 1, "fabricated file path must be flagged");

// A fabricated PR number is rejected.
const fabricatedPr: QAAnswer = {
  answer: "This was decided in a PR.",
  sources: [{ type: "pr", number: 99999, url: "https://github.com/supabase/supabase/pull/99999" }],
  confidence: "medium",
};
assert.equal(validateAnswerGrounding(fabricatedPr, keys).length, 1, "fabricated PR number must be flagged");

// A mix of one real and one invented source flags only the invented one.
const mixed: QAAnswer = {
  answer: "Partly grounded.",
  sources: [
    { type: "readme", path: "README.md" },
    { type: "commit", hash: "deadbeefcafe" },
  ],
  confidence: "medium",
};
assert.equal(validateAnswerGrounding(mixed, keys).length, 1, "only the invented source should be flagged");

// A pointer to the brief itself is always allowed.
const briefRef: QAAnswer = {
  answer: "I don't have enough data to answer confidently.",
  sources: [{ type: "brief", section: "system narrative" }],
  confidence: "low",
};
assert.deepEqual(validateAnswerGrounding(briefRef, keys), [], "brief section reference should be allowed");

// Architecture-diagram module paths count as grounded file references.
const firstNode = sampleBrief.architectureDiagram.nodes[0];
assert.ok(firstNode, "sample brief should have a diagram node");
const nodeAnswer: QAAnswer = { answer: "That module.", sources: [{ type: "file", path: firstNode.path }], confidence: "high" };
assert.deepEqual(validateAnswerGrounding(nodeAnswer, keys), [], "diagram node path should be grounded");

process.stdout.write("qa grounding tests passed\n");
