import assert from "node:assert/strict";
import type { GitHubTreeFile } from "@codebrief/shared";
import { extractAst, summarizeSourceFile } from "./ast.js";
import type { GitHubApiClient } from "./github-client.js";

const blobs = new Map<string, string>([
  ["ts", 'import x from "./x"; export function run(flag: boolean) { if (flag) return x; return null; } export { run as execute };'],
  ["tsx", 'import React from "react"; export function View() { return <main>Codebrief</main>; }'],
  ["py", "import os, sys\nfrom .settings import CONFIG\nclass Worker:\n    pass\n\ndef handle(value):\n    if value:\n        return CONFIG\n    return os.getcwd()\n"],
  ["go", 'package main\n\nimport (\n  "fmt"\n  "github.com/acme/pkg"\n)\n\ntype Server struct{}\nfunc (s *Server) Run() { if true && false { fmt.Println("x") } }\n'],
  ["rb", 'require "json"\nmodule Billing\n  class Checkout\n    def self.call\n      JSON.parse("{}")\n    end\n  end\nend\n'],
  ["java", "package app;\nimport java.util.List;\npublic class Service {\n  public String name() { return \"service\"; }\n}\n"],
  ["rs", "use crate::config;\npub struct App {}\npub fn run() {\n  if true { }\n}\n"],
  ["ignored", "export const ignored = true;"],
]);

const client = {
  async getBlobText(_: string, __: string, sha: string) {
    const value = blobs.get(sha);
    if (!value) throw new Error(`missing blob ${sha}`);
    return value;
  },
} as GitHubApiClient;

const treeFiles: GitHubTreeFile[] = [
  file("src/app.ts", "ts"),
  file("src/view.tsx", "tsx"),
  file("src/worker.py", "py"),
  file("cmd/server/main.go", "go"),
  file("lib/billing.rb", "rb"),
  file("src/main/java/app/Service.java", "java"),
  file("src/lib.rs", "rs"),
  file("node_modules/bad.ts", "ignored"),
];

const summaries = await extractAst(client, "owner", "repo", treeFiles);
assert.equal(summaries.length, 7);

const ts = byPath("src/app.ts");
assert.deepEqual(ts.imports, ["./x"]);
assert.ok(ts.exports.includes("run"));
assert.ok(ts.exports.includes("execute"));
assert.equal(ts.parseError, false);

const tsx = byPath("src/view.tsx");
assert.deepEqual(tsx.imports, ["react"]);
assert.ok(tsx.exports.includes("View"));

const py = byPath("src/worker.py");
assert.deepEqual(py.imports, [".settings", "os", "sys"]);
assert.ok(py.exports.includes("Worker"));
assert.ok(py.exports.includes("handle"));
assert.ok(py.complexity >= 2);
assert.equal(py.parseError, false);

const go = byPath("cmd/server/main.go");
assert.deepEqual(go.imports, ["fmt", "github.com/acme/pkg"]);
assert.ok(go.exports.includes("Run"));
assert.ok(go.exports.includes("Server"));
assert.ok(go.complexity >= 3);

const ruby = byPath("lib/billing.rb");
assert.deepEqual(ruby.imports, ["json"]);
assert.ok(ruby.exports.includes("Billing"));
assert.ok(ruby.exports.includes("Checkout"));
assert.ok(ruby.exports.includes("self.call"));

const java = byPath("src/main/java/app/Service.java");
assert.deepEqual(java.imports, ["java.util.List"]);
assert.ok(java.exports.includes("Service"));
assert.ok(java.exports.includes("name"));

const rust = byPath("src/lib.rs");
assert.deepEqual(rust.imports, ["crate::config"]);
assert.ok(rust.exports.includes("App"));
assert.ok(rust.exports.includes("run"));

// Regression: a parser that throws (tree-sitter raises "Invalid argument" on some
// large/generated files, e.g. supabase's __registry__/index.tsx) must degrade to a
// parseError summary instead of crashing the whole analysis.
const throwingParsers = {
  typescript: {
    parse() {
      throw new Error("Invalid argument");
    },
  },
  tsx: {
    parse() {
      throw new Error("Invalid argument");
    },
  },
} as unknown as Parameters<typeof summarizeSourceFile>[2];
const degraded = summarizeSourceFile("apps/registry/index.tsx", "export const huge = {};", throwingParsers);
assert.equal(degraded.parseError, true);
assert.equal(degraded.path, "apps/registry/index.tsx");
assert.deepEqual(degraded.imports, []);
assert.deepEqual(degraded.exports, []);

process.stdout.write("pipeline ast tests passed\n");

function byPath(path: string) {
  const summary = summaries.find((item) => item.path === path);
  assert.ok(summary, `missing AST summary for ${path}`);
  return summary;
}

function file(path: string, sha: string): GitHubTreeFile {
  return {
    path,
    type: "blob",
    mode: "100644",
    sha,
    size: blobs.get(sha)?.length || 0,
    url: `https://api.github.com/repos/owner/repo/git/blobs/${sha}`,
  };
}
