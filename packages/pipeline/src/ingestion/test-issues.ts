import assert from "node:assert/strict";
import type { IssueSummary } from "@codebrief/shared";
import type { ArtifactStore } from "../storage/r2-client.js";
import { ingestIssueCsvArtifact, mergeIssueSummaries, parseIssueCsvArtifact } from "./issues.js";

const csv = [
  "Issue key,Summary,Description,Status,Created,Updated,Resolved,Labels,URL,Comment count",
  'CB-42,"Retry failed stage","Stage retry must preserve evidence.",Done,2026-01-01,2026-01-02,2026-01-03,"architecture,bug",https://linear.app/codebrief/issue/CB-42/retry-failed-stage,3',
  'CB-43,"Import artifact issues","CSV rows should feed history.",In Progress,2026-02-01,2026-02-03,,"history;import",,',
].join("\n");

const imported = parseIssueCsvArtifact("uploads/issues.csv", Buffer.from(csv), {
  now: new Date("2026-06-13T00:00:00Z"),
});

assert.equal(imported.length, 2);
assert.equal(imported[0]?.number, 1_000_042);
assert.equal(imported[0]?.title, "[CB-42] Retry failed stage");
assert.equal(imported[0]?.state, "closed");
assert.equal(imported[0]?.createdAt, "2026-01-01T00:00:00.000Z");
assert.equal(imported[0]?.updatedAt, "2026-01-02T00:00:00.000Z");
assert.equal(imported[0]?.closedAt, "2026-01-03T00:00:00.000Z");
assert.deepEqual(imported[0]?.labels, ["architecture", "bug"]);
assert.equal(imported[0]?.htmlUrl, "https://linear.app/codebrief/issue/CB-42/retry-failed-stage");
assert.equal(imported[0]?.comments, 3);
assert.match(imported[0]?.body || "", /Imported from uploads\/issues\.csv row 2/);

assert.equal(imported[1]?.number, 1_000_043);
assert.equal(imported[1]?.state, "open");
assert.equal(imported[1]?.closedAt, null);
assert.deepEqual(imported[1]?.labels, ["history", "import"]);
assert.equal(imported[1]?.htmlUrl, "https://codebrief.local/artifacts/uploads%2Fissues.csv#row-3");
assert.equal(imported[1]?.comments, 0);

const githubIssue: IssueSummary = {
  number: 7,
  title: "GitHub issue",
  body: "GitHub issue body",
  state: "open",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  closedAt: null,
  htmlUrl: "https://github.com/owner/repo/issues/7",
  labels: ["github"],
  comments: 1,
};
const merged = mergeIssueSummaries([githubIssue, imported[0] as IssueSummary], imported, 3);
assert.deepEqual(
  merged.map((issue) => issue.title),
  ["[CB-42] Retry failed stage", "[CB-43] Import artifact issues", "GitHub issue"],
);

const artifactReads: string[] = [];
const artifactStore: ArtifactStore = {
  async putJson() {
    return { key: "unused", sizeBytes: 0 };
  },
  async getBuffer(key) {
    artifactReads.push(key);
    return Buffer.from(csv);
  },
};
const artifactIssues = await ingestIssueCsvArtifact(artifactStore, "uploads/issues.csv");
assert.equal(artifactReads[0], "uploads/issues.csv");
assert.equal(artifactIssues.length, 2);

assert.throws(
  () => parseIssueCsvArtifact("uploads/issues.json", Buffer.from(csv)),
  /Expected a CSV file/,
);
assert.throws(
  () => parseIssueCsvArtifact("uploads/issues.csv", Buffer.from("Key,Description\nCB-1,No title")),
  /did not contain rows with a title or summary/,
);

process.stdout.write("issue CSV ingestion tests passed\n");
