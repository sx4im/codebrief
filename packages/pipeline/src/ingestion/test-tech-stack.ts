import type { GitHubTreeFile } from "@codebrief/shared";
import type { DependencyFinding } from "./deps.js";
import { detectTechStack } from "./tech-stack.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function blob(path: string): GitHubTreeFile {
  return { path, mode: "100644", type: "blob", sha: "x", url: "https://example.com/blob" };
}

function dir(path: string): GitHubTreeFile {
  return { path, mode: "040000", type: "tree", sha: "x", url: "https://example.com/tree" };
}

function dep(name: string, manager: DependencyFinding["manager"]): DependencyFinding {
  return { manager, name, version: "1.0.0", source: { type: "file", path: "package.json" }, flags: [], vulnerabilities: [] };
}

function names(signals: { name: string }[]): string[] {
  return signals.map((signal) => signal.name);
}

// --- Next.js + TypeScript monorepo (npm) ---
{
  const tree: GitHubTreeFile[] = [
    dir("src"),
    blob("package.json"),
    blob("package-lock.json"),
    blob("next.config.mjs"),
    blob("src/app/page.tsx"),
    blob("src/app/layout.tsx"),
    blob("src/lib/util.ts"),
    blob("README.md"),
  ];
  const deps: DependencyFinding[] = [dep("next", "npm"), dep("react", "npm")];
  const stack = detectTechStack(tree, deps);

  assert(names(stack.packageManagers).includes("npm"), `expected npm package manager, got ${JSON.stringify(stack.packageManagers)}`);
  const npm = stack.packageManagers.find((manager) => manager.name === "npm");
  assert(npm?.evidence === "package-lock.json", `npm evidence should be the lockfile, got ${npm?.evidence}`);

  assert(names(stack.frameworks).includes("Next.js"), "expected Next.js framework");
  assert(names(stack.frameworks).includes("React"), "expected React framework");
  // Next.js is provable via both dependency "next" and next.config.mjs -> exactly one entry.
  assert(stack.frameworks.filter((framework) => framework.name === "Next.js").length === 1, "Next.js must be de-duplicated");

  assert(names(stack.primaryLanguages)[0] === "TypeScript", `expected TypeScript to be the primary language, got ${JSON.stringify(stack.primaryLanguages)}`);
}

// --- Django + Python (pip), framework provable by file and dependency ---
{
  const tree: GitHubTreeFile[] = [
    blob("manage.py"),
    blob("requirements.txt"),
    blob("app/models.py"),
    blob("app/views.py"),
    blob("app/urls.py"),
  ];
  const deps: DependencyFinding[] = [dep("django", "python")];
  const stack = detectTechStack(tree, deps);

  assert(names(stack.packageManagers).includes("pip"), "expected pip package manager");
  assert(names(stack.frameworks).includes("Django"), "expected Django framework");
  assert(stack.frameworks.filter((framework) => framework.name === "Django").length === 1, "Django must be de-duplicated across file+dependency evidence");
  assert(names(stack.primaryLanguages)[0] === "Python", "expected Python primary language");
}

// --- Go service with Gin ---
{
  const tree: GitHubTreeFile[] = [blob("go.mod"), blob("go.sum"), blob("main.go"), blob("internal/server/router.go")];
  const deps: DependencyFinding[] = [dep("github.com/gin-gonic/gin", "go")];
  const stack = detectTechStack(tree, deps);

  assert(names(stack.packageManagers).includes("go modules"), "expected go modules package manager");
  assert(names(stack.frameworks).includes("Gin"), "expected Gin framework");
  assert(names(stack.primaryLanguages).includes("Go"), "expected Go primary language");
}

// --- No recognizable manifests/deps -> empty signals, no crash ---
{
  const stack = detectTechStack([blob("docs/notes.txt"), dir("docs")], []);
  assert(stack.packageManagers.length === 0, "expected no package managers");
  assert(stack.frameworks.length === 0, "expected no frameworks");
  assert(stack.primaryLanguages.length === 0, "expected no recognized languages");
}

process.stdout.write("tech stack tests passed\n");
