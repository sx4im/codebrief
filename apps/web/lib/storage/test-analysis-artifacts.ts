import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isOwnedUploadKey, storeAnalysisUpload, validateUpload } from "./analysis-artifacts";

const artifactDir = await mkdtemp(path.join(os.tmpdir(), "codebrief-upload-artifacts-"));
const originalDriver = process.env.ARTIFACT_STORAGE_DRIVER;
const originalLocalDir = process.env.ARTIFACT_LOCAL_DIR;

try {
  process.env.ARTIFACT_STORAGE_DRIVER = "local";
  process.env.ARTIFACT_LOCAL_DIR = artifactDir;

  const docsFile = new File([Buffer.from("# Imported Docs\n\nArchitecture notes.")], "../Notion Export.zip", {
    type: "application/zip",
  });
  const docs = await storeAnalysisUpload({
    userId: "user:test@example.com",
    kind: "docs",
    file: docsFile,
    now: new Date("2026-06-13T12:00:00Z"),
  });
  assert.equal(docs.kind, "docs");
  assert.equal(docs.fileName, "Notion-Export.zip");
  assert.equal(docs.contentType, "application/zip");
  assert.match(docs.key, /^uploads\/user-test-example-com\/docs\/2026-06-13\/1781352000000-[0-9a-f-]+-Notion-Export\.zip$/);
  assert.equal(await readFile(path.join(artifactDir, docs.key), "utf8"), "# Imported Docs\n\nArchitecture notes.");

  const issuesFile = new File(["Key,Summary\nCB-1,Retry queue"], "linear export.csv", { type: "text/csv" });
  const issues = await storeAnalysisUpload({
    userId: "user_123",
    kind: "issues",
    file: issuesFile,
    now: new Date("2026-06-13T12:01:00Z"),
  });
  assert.equal(issues.kind, "issues");
  assert.equal(issues.fileName, "linear-export.csv");
  assert.equal(issues.contentType, "text/csv");
  assert.equal(await readFile(path.join(artifactDir, issues.key), "utf8"), "Key,Summary\nCB-1,Retry queue");

  assert.throws(() => validateUpload("docs", "notes.exe", 10), /Docs uploads must be/);
  assert.throws(() => validateUpload("issues", "issues.json", 10), /Issue uploads must be CSV/);
  assert.throws(() => validateUpload("docs", "notes.md", 0), /empty/);
  assert.throws(() => validateUpload("issues", "issues.csv", 21 * 1024 * 1024), /20 MB/);

  // Artifact-key ownership guard (IDOR protection on the analysis-start route).
  // A user may only reference an upload key produced under their own prefix.
  assert.equal(isOwnedUploadKey("user:test@example.com", docs.key), true);
  assert.equal(isOwnedUploadKey("user_123", issues.key), true);
  // Same key, different user -> rejected (cross-account reference).
  assert.equal(isOwnedUploadKey("user_123", docs.key), false);
  assert.equal(isOwnedUploadKey("user:test@example.com", issues.key), false);
  // Internal pipeline artifacts (`<analysisId>/...`, no uploads/ prefix) -> rejected.
  assert.equal(isOwnedUploadKey("user_123", "analysis-42/architecture.json"), false);
  // Path traversal and empty/leading-slash edge cases -> rejected.
  assert.equal(isOwnedUploadKey("user_123", "uploads/user_123/../user_456/docs/x"), false);
  assert.equal(isOwnedUploadKey("user_123", ""), false);
  // A leading slash is normalized away before the prefix check.
  assert.equal(isOwnedUploadKey("user_123", `/${issues.key}`), true);
} finally {
  if (originalDriver === undefined) {
    delete process.env.ARTIFACT_STORAGE_DRIVER;
  } else {
    process.env.ARTIFACT_STORAGE_DRIVER = originalDriver;
  }
  if (originalLocalDir === undefined) {
    delete process.env.ARTIFACT_LOCAL_DIR;
  } else {
    process.env.ARTIFACT_LOCAL_DIR = originalLocalDir;
  }
  await rm(artifactDir, { recursive: true, force: true });
}

process.stdout.write("analysis artifact upload tests passed\n");
