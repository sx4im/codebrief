import path from "node:path";
import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import type { AstFileSummary, GitHubTreeFile } from "./types.js";

interface FileContent {
  path: string;
  content: string;
}

const EXCLUDED_SEGMENTS = new Set([
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "vendor",
]);

const COMPLEXITY_NODE_TYPES = new Set([
  "catch_clause",
  "conditional_expression",
  "do_statement",
  "else_clause",
  "for_in_statement",
  "for_of_statement",
  "for_statement",
  "if_statement",
  "switch_case",
  "while_statement",
]);

export function isLikelyTypeScriptSource(file: GitHubTreeFile, maxFileBytes: number): boolean {
  if (file.type !== "blob") {
    return false;
  }
  if (!file.path.endsWith(".ts") && !file.path.endsWith(".tsx")) {
    return false;
  }
  if (file.path.endsWith(".d.ts")) {
    return false;
  }
  if ((file.size || 0) > maxFileBytes) {
    return false;
  }
  const segments = file.path.split("/");
  if (segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))) {
    return false;
  }
  return !/(^|\/)(__fixtures__|fixtures|generated|snapshots|testdata)(\/|$)/.test(file.path);
}

export function pickTypeScriptFiles(
  treeFiles: GitHubTreeFile[],
  maxFiles: number,
  maxFileBytes: number,
): GitHubTreeFile[] {
  return treeFiles
    .filter((file) => isLikelyTypeScriptSource(file, maxFileBytes))
    .sort((a, b) => sourcePriority(a.path) - sourcePriority(b.path))
    .slice(0, maxFiles);
}

export function extractAstSummaries(files: FileContent[]): AstFileSummary[] {
  const tsParser = new Parser();
  tsParser.setLanguage(TypeScript.typescript);
  const tsxParser = new Parser();
  tsxParser.setLanguage(TypeScript.tsx);

  return files.map((file) => {
    const parser = file.path.endsWith(".tsx") ? tsxParser : tsParser;
    const tree = parser.parse(file.content);
    const metrics = collectTreeMetrics(tree.rootNode);
    return {
      path: file.path,
      imports: extractImports(file.content),
      exports: extractExports(file.content),
      complexity: metrics.complexity,
      nodeCount: metrics.nodeCount,
      parseError: tree.rootNode.hasError,
      source: {
        type: "file",
        path: file.path,
      },
    };
  });
}

function sourcePriority(filePath: string): number {
  if (filePath.startsWith("apps/")) {
    return 0;
  }
  if (filePath.startsWith("packages/")) {
    return 1;
  }
  if (filePath.startsWith("studio/")) {
    return 2;
  }
  if (filePath.startsWith("src/")) {
    return 3;
  }
  return filePath.split("/").length + 4;
}

function collectTreeMetrics(root: Parser.SyntaxNode): { complexity: number; nodeCount: number } {
  let complexity = 1;
  let nodeCount = 0;
  walk(root, (node) => {
    nodeCount += 1;
    if (COMPLEXITY_NODE_TYPES.has(node.type)) {
      complexity += 1;
    }
    if (node.type === "binary_expression" && /\|\||&&/.test(node.text)) {
      complexity += 1;
    }
  });
  return { complexity, nodeCount };
}

function walk(node: Parser.SyntaxNode, visitor: (node: Parser.SyntaxNode) => void): void {
  visitor(node);
  for (const child of node.namedChildren) {
    walk(child, visitor);
  }
}

function extractImports(content: string): string[] {
  const imports = new Set<string>();
  for (const match of content.matchAll(/\bimport(?:\s+type)?[\s\S]*?\bfrom\s+["']([^"']+)["']/g)) {
    if (match[1]) {
      imports.add(match[1]);
    }
  }
  for (const match of content.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (match[1]) {
      imports.add(match[1]);
    }
  }
  return [...imports].sort();
}

function extractExports(content: string): string[] {
  const exports = new Set<string>();
  const patterns = [
    /\bexport\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g,
    /\bexport\s+class\s+([A-Za-z0-9_$]+)/g,
    /\bexport\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g,
    /\bexport\s+(?:type|interface)\s+([A-Za-z0-9_$]+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) {
        exports.add(match[1]);
      }
    }
  }
  for (const match of content.matchAll(/\bexport\s*{([^}]+)}/g)) {
    const names = match[1]?.split(",") || [];
    for (const name of names) {
      const exported = name.trim().split(/\s+as\s+/i).at(-1)?.trim();
      if (exported) {
        exports.add(exported);
      }
    }
  }
  return [...exports].sort();
}

export function resolveImport(fromFile: string, importPath: string, knownFiles: Set<string>): string | null {
  if (!importPath.startsWith(".")) {
    return null;
  }
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), importPath));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.posix.join(base, "index.ts"),
    path.posix.join(base, "index.tsx"),
  ];
  return candidates.find((candidate) => knownFiles.has(candidate)) || null;
}
