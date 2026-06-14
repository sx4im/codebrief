import assert from "node:assert/strict";
import type { GitHubTreeFile } from "@codebrief/shared";
import JSZip from "jszip";
import type { ArtifactStore } from "../storage/r2-client.js";
import { ingestDocs, parseDocumentationArtifact } from "./docs.js";
import type { GitHubApiClient } from "./github-client.js";

const blobs = new Map<string, string>([
  ["arch-sha", "# Architecture\n\nThe worker consumes BullMQ jobs and writes artifacts."],
  ["contrib-sha", "# Contributing\n\nUse sourced claims in every brief."],
  ["ignored-sha", "Plain text under docs should not be read from the repo tree."],
]);

const client = {
  async getBlobText(_: string, __: string, sha: string) {
    const value = blobs.get(sha);
    if (!value) throw new Error(`missing blob ${sha}`);
    return value;
  },
} as GitHubApiClient;

const zip = new JSZip();
zip.file("notion/Product Strategy.md", "# Product Strategy\n\nThe handover brief focuses on acquisition diligence.");
zip.file("confluence/Operations.html", "<main><h1>Operations</h1><p>Queue &amp; retry policy.</p></main>");
zip.file(
  "exports/pages.json",
  JSON.stringify({
    pages: [
      { path: "jira/Risk Notes.md", text: "Risk notes call out billing retries." },
      { title: "HTML Decision", html: "<article><h2>Decision</h2><p>Keep R2 artifacts.</p></article>" },
    ],
  }),
);
zip.file("__MACOSX/._Product Strategy.md", "hidden metadata");
zip.file("assets/diagram.png", Buffer.from([1, 2, 3]));
const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

const artifactReads: string[] = [];
const artifactStore: ArtifactStore = {
  async putJson() {
    return { key: "unused", sizeBytes: 0 };
  },
  async getBuffer(key) {
    artifactReads.push(key);
    assert.equal(key, "uploads/docs-export.zip");
    return zipBuffer;
  },
};

const treeFiles: GitHubTreeFile[] = [
  { path: "ARCHITECTURE.md", type: "blob", mode: "100644", sha: "arch-sha", size: 100, url: "https://example.com/arch" },
  { path: "CONTRIBUTING.md", type: "blob", mode: "100644", sha: "contrib-sha", size: 100, url: "https://example.com/contrib" },
  { path: "docs/notes.txt", type: "blob", mode: "100644", sha: "ignored-sha", size: 100, url: "https://example.com/notes" },
];

const pages = await ingestDocs(client, "owner", "repo", treeFiles, "  # README\n\nMain repo context.  ", {
  artifactStore,
  docsArtifactKey: "uploads/docs-export.zip",
});

assert.equal(artifactReads.length, 1);
assert.deepEqual(
  pages.map((page) => page.path),
  [
    "README.md",
    "ARCHITECTURE.md",
    "CONTRIBUTING.md",
    "confluence/Operations.html",
    "jira/Risk Notes.md",
    "HTML Decision",
    "notion/Product Strategy.md",
  ],
);
assert.equal(pages[0]?.text, "# README\n\nMain repo context.");
assert.equal(pages[0]?.source.type, "readme");
assert.equal(pages[1]?.text, "# Architecture\n\nThe worker consumes BullMQ jobs and writes artifacts.");
assert.equal(pages[2]?.source.path, "CONTRIBUTING.md");
assert.match(pages[3]?.text || "", /Queue & retry policy/);
assert.equal(pages[4]?.source.storageKey, "uploads/docs-export.zip");
assert.equal(pages[5]?.text, "Decision\nKeep R2 artifacts.");
assert.ok(pages[6]?.text.includes("handover brief"));

const markdownArtifact = await parseDocumentationArtifact("uploads/context.md", Buffer.from("# Context\n\nSourced docs."));
assert.equal(markdownArtifact.length, 1);
assert.equal(markdownArtifact[0]?.source.storageKey, "uploads/context.md");

const jsonArtifact = await parseDocumentationArtifact(
  "uploads/pages.json",
  Buffer.from(JSON.stringify([{ title: "Support Notes", markdown: "Escalate failed stage retries." }])),
);
assert.equal(jsonArtifact[0]?.path, "Support Notes");
assert.equal(jsonArtifact[0]?.text, "Escalate failed stage retries.");

await assert.rejects(
  () => ingestDocs(client, "owner", "repo", [], "", { docsArtifactKey: "uploads/missing.md" }),
  /docsArtifactKey was provided but no artifact store is available/,
);
await assert.rejects(
  () => parseDocumentationArtifact("uploads/archive.bin", Buffer.from([0, 1, 2])),
  /Unsupported documentation artifact format/,
);

process.stdout.write("docs ingestion tests passed\n");
