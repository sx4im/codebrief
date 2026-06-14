import type { GitHubTreeFile } from "@codebrief/shared";
import type { DependencyFinding } from "./deps.js";

// PRD Phase 1 / Step 1.1: detect the primary language(s), framework(s), and
// package manager(s). This is a deterministic, evidence-carrying signal (each
// detection names the manifest/config file or dependency that proves it) fed to
// the Architecture Agent so the system narrative describes the real stack
// instead of guessing from file names.

export interface TechStackSignal {
  name: string;
  evidence: string;
}

export interface TechStack {
  packageManagers: TechStackSignal[];
  frameworks: TechStackSignal[];
  primaryLanguages: TechStackSignal[];
}

const PACKAGE_MANAGER_FILES: Array<{ match: (path: string) => boolean; name: string }> = [
  { name: "npm", match: (p) => p === "package-lock.json" || p.endsWith("/package-lock.json") },
  { name: "yarn", match: (p) => p === "yarn.lock" || p.endsWith("/yarn.lock") },
  { name: "pnpm", match: (p) => p === "pnpm-lock.yaml" || p.endsWith("/pnpm-lock.yaml") },
  { name: "bun", match: (p) => p === "bun.lockb" || p.endsWith("/bun.lockb") },
  { name: "poetry", match: (p) => baseName(p) === "poetry.lock" },
  { name: "pipenv", match: (p) => baseName(p) === "Pipfile" },
  { name: "pip", match: (p) => baseName(p) === "requirements.txt" },
  { name: "bundler", match: (p) => baseName(p) === "Gemfile" },
  { name: "go modules", match: (p) => baseName(p) === "go.mod" },
  { name: "cargo", match: (p) => baseName(p) === "Cargo.toml" },
  { name: "maven", match: (p) => baseName(p) === "pom.xml" },
  { name: "gradle", match: (p) => baseName(p) === "build.gradle" || baseName(p) === "build.gradle.kts" },
  { name: "composer", match: (p) => baseName(p) === "composer.json" },
];

// Frameworks proven by a dependency name (exact or prefix) ...
const FRAMEWORK_DEPENDENCIES: Array<{ name: string; matches: string[] }> = [
  { name: "Next.js", matches: ["next"] },
  { name: "Remix", matches: ["@remix-run/react", "@remix-run/node"] },
  { name: "React", matches: ["react"] },
  { name: "Vue", matches: ["vue"] },
  { name: "Svelte", matches: ["svelte"] },
  { name: "Angular", matches: ["@angular/core"] },
  { name: "NestJS", matches: ["@nestjs/core"] },
  { name: "Express", matches: ["express"] },
  { name: "Fastify", matches: ["fastify"] },
  { name: "Django", matches: ["django", "Django"] },
  { name: "Flask", matches: ["flask", "Flask"] },
  { name: "FastAPI", matches: ["fastapi"] },
  { name: "Ruby on Rails", matches: ["rails"] },
  { name: "Sinatra", matches: ["sinatra"] },
  { name: "Gin", matches: ["github.com/gin-gonic/gin"] },
  { name: "Echo", matches: ["github.com/labstack/echo"] },
  { name: "Fiber", matches: ["github.com/gofiber/fiber"] },
];

// ... and frameworks proven by a characteristic config file.
const FRAMEWORK_FILES: Array<{ name: string; match: (path: string) => boolean }> = [
  { name: "Next.js", match: (p) => /(^|\/)next\.config\.(js|mjs|ts|cjs)$/.test(p) },
  { name: "Nuxt", match: (p) => /(^|\/)nuxt\.config\.(js|mjs|ts)$/.test(p) },
  { name: "Astro", match: (p) => /(^|\/)astro\.config\.(js|mjs|ts)$/.test(p) },
  { name: "Vite", match: (p) => /(^|\/)vite\.config\.(js|mjs|ts)$/.test(p) },
  { name: "Django", match: (p) => baseName(p) === "manage.py" },
  { name: "Ruby on Rails", match: (p) => p === "config/application.rb" || p.endsWith("/config/application.rb") },
];

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  py: "Python",
  go: "Go",
  rb: "Ruby",
  java: "Java",
  rs: "Rust",
  php: "PHP",
  cs: "C#",
  kt: "Kotlin",
  swift: "Swift",
  c: "C",
  cc: "C++",
  cpp: "C++",
  h: "C/C++",
};

export function detectTechStack(treeFiles: GitHubTreeFile[], dependencies: DependencyFinding[]): TechStack {
  const blobPaths = treeFiles.filter((file) => file.type === "blob").map((file) => file.path);

  const packageManagers = dedupeByName(
    PACKAGE_MANAGER_FILES.flatMap((manager) => {
      const evidence = blobPaths.find((path) => manager.match(path));
      return evidence ? [{ name: manager.name, evidence }] : [];
    }),
  );

  const dependencyNames = new Map(dependencies.map((dependency) => [dependency.name, dependency] as const));
  const frameworks = dedupeByName([
    ...FRAMEWORK_DEPENDENCIES.flatMap((framework) => {
      for (const [name, dependency] of dependencyNames) {
        if (framework.matches.includes(name)) {
          return [{ name: framework.name, evidence: `dependency ${name} (${dependency.manager})` }];
        }
      }
      return [];
    }),
    ...FRAMEWORK_FILES.flatMap((framework) => {
      const evidence = blobPaths.find((path) => framework.match(path));
      return evidence ? [{ name: framework.name, evidence }] : [];
    }),
  ]);

  const primaryLanguages = detectPrimaryLanguages(blobPaths);

  return { packageManagers, frameworks, primaryLanguages };
}

function detectPrimaryLanguages(blobPaths: string[]): TechStackSignal[] {
  const counts = new Map<string, number>();
  for (const path of blobPaths) {
    const extension = path.includes(".") ? path.split(".").pop()?.toLowerCase() : undefined;
    if (!extension) continue;
    const language = LANGUAGE_BY_EXTENSION[extension];
    if (!language) continue;
    counts.set(language, (counts.get(language) || 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total === 0) return [];
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    // Keep languages that make up at least 5% of recognized source files, capped at the top 5.
    .filter(([, count]) => count / total >= 0.05)
    .slice(0, 5)
    .map(([language, count]) => ({ name: language, evidence: `${count} ${language} file(s) (${Math.round((count / total) * 100)}%)` }));
}

function baseName(path: string): string {
  return path.split("/").pop() || path;
}

function dedupeByName(signals: TechStackSignal[]): TechStackSignal[] {
  const seen = new Map<string, TechStackSignal>();
  for (const signal of signals) {
    if (!seen.has(signal.name)) seen.set(signal.name, signal);
  }
  return [...seen.values()];
}
