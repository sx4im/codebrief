import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import type { FileAstSummary, GitHubTreeFile } from "@codebrief/shared";
import { GitHubApiClient } from "./github-client.js";

const EXCLUDED_SEGMENTS = new Set([".git", ".next", "build", "coverage", "dist", "node_modules", "vendor"]);
const COMPLEXITY_NODES = new Set([
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

interface AstParsers {
  typescript: Parser;
  tsx: Parser;
}

type SourceLanguage = "typescript" | "tsx" | "python" | "go" | "ruby" | "java" | "rust";

export async function extractAst(
  client: GitHubApiClient,
  owner: string,
  repo: string,
  treeFiles: GitHubTreeFile[],
  maxFiles = 500,
): Promise<FileAstSummary[]> {
  const sourceFiles = treeFiles.filter(isSourceFile).sort((a, b) => sourcePriority(a.path) - sourcePriority(b.path)).slice(0, maxFiles);
  const parsers = createParsers();
  const output: FileAstSummary[] = [];

  for (const file of sourceFiles) {
    const text = await client.getBlobText(owner, repo, file.sha);
    output.push(summarizeSourceFile(file.path, text, parsers));
  }

  return output;
}

export function summarizeSourceFile(filePath: string, text: string, parsers = createParsers()): FileAstSummary {
  const language = sourceLanguage(filePath);
  try {
    if (language === "typescript" || language === "tsx") {
      const parser = language === "tsx" ? parsers.tsx : parsers.typescript;
      const tree = parser.parse(text);
      const metrics = collectMetrics(tree.rootNode);
      return {
        path: filePath,
        imports: extractTypeScriptImports(text),
        exports: extractTypeScriptExports(text),
        complexity: metrics.complexity,
        nodeCount: metrics.nodeCount,
        parseError: tree.rootNode.hasError,
      };
    }

    return {
      path: filePath,
      imports: extractLexicalImports(language, text),
      exports: extractLexicalExports(language, text),
      complexity: lexicalComplexity(text),
      nodeCount: text.split("\n").filter((line) => line.trim()).length,
      parseError: false,
    };
  } catch (error) {
    // PRD risk mitigation: tree-sitter can throw on unusual/oversized code (the
    // native binding raises "Invalid argument"). Skip AST for that one file and
    // mark it unavailable rather than failing the whole repository analysis.
    process.stderr.write(`[ast] parse failed for ${filePath}: ${error instanceof Error ? error.message : String(error)}\n`);
    return { path: filePath, imports: [], exports: [], complexity: 1, nodeCount: text.split("\n").length, parseError: true };
  }
}

function isSourceFile(file: GitHubTreeFile): boolean {
  if (file.type !== "blob") return false;
  if (!sourceLanguage(file.path) || file.path.endsWith(".d.ts") || file.path.endsWith(".min.js")) return false;
  if ((file.size || 0) > 250_000) return false;
  if (file.path.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment))) return false;
  return !/(^|\/)(__fixtures__|fixtures|generated|snapshots|testdata)(\/|$)/.test(file.path);
}

function createParsers(): AstParsers {
  const typescript = new Parser();
  typescript.setLanguage(TypeScript.typescript);
  const tsx = new Parser();
  tsx.setLanguage(TypeScript.tsx);
  return { typescript, tsx };
}

function sourceLanguage(filePath: string): SourceLanguage | null {
  if (/\.(tsx|jsx)$/.test(filePath)) return "tsx";
  if (/\.(ts|js|mjs|cjs)$/.test(filePath)) return "typescript";
  if (filePath.endsWith(".py")) return "python";
  if (filePath.endsWith(".go")) return "go";
  if (filePath.endsWith(".rb")) return "ruby";
  if (filePath.endsWith(".java")) return "java";
  if (filePath.endsWith(".rs")) return "rust";
  return null;
}

function sourcePriority(filePath: string): number {
  if (filePath.startsWith("apps/")) return 0;
  if (filePath.startsWith("packages/")) return 1;
  if (filePath.startsWith("src/")) return 2;
  return filePath.split("/").length + 3;
}

function collectMetrics(root: Parser.SyntaxNode): { complexity: number; nodeCount: number } {
  let complexity = 1;
  let nodeCount = 0;
  const visit = (node: Parser.SyntaxNode) => {
    nodeCount += 1;
    if (COMPLEXITY_NODES.has(node.type)) complexity += 1;
    if (node.type === "binary_expression" && /\|\||&&/.test(node.text)) complexity += 1;
    for (const child of node.namedChildren) visit(child);
  };
  visit(root);
  return { complexity, nodeCount };
}

function extractTypeScriptImports(text: string): string[] {
  const imports = new Set<string>();
  for (const match of text.matchAll(/\bimport(?:\s+type)?[\s\S]*?\bfrom\s+["']([^"']+)["']/g)) {
    if (match[1]) imports.add(match[1]);
  }
  for (const match of text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (match[1]) imports.add(match[1]);
  }
  return [...imports].sort();
}

function extractTypeScriptExports(text: string): string[] {
  const exports = new Set<string>();
  for (const pattern of [
    /\bexport\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g,
    /\bexport\s+class\s+([A-Za-z0-9_$]+)/g,
    /\bexport\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g,
    /\bexport\s+(?:type|interface)\s+([A-Za-z0-9_$]+)/g,
  ]) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) exports.add(match[1]);
    }
  }
  for (const match of text.matchAll(/\bexport\s*{([^}]+)}/g)) {
    for (const name of match[1]?.split(",") || []) {
      const exported = name.trim().split(/\s+as\s+/i).at(-1)?.trim();
      if (exported) exports.add(exported);
    }
  }
  return [...exports].sort();
}

function extractLexicalImports(language: SourceLanguage | null, text: string): string[] {
  const imports = new Set<string>();
  const lines = text.split("\n");

  if (language === "python") {
    for (const line of lines) {
      const direct = line.match(/^\s*import\s+(.+)$/);
      if (direct?.[1]) {
        for (const name of direct[1].split(",")) imports.add(name.trim().split(/\s+as\s+/i)[0]?.trim() || "");
      }
      const from = line.match(/^\s*from\s+([A-Za-z0-9_.]+|\.+[A-Za-z0-9_.]*)\s+import\s+/);
      if (from?.[1]) imports.add(from[1]);
    }
  }

  if (language === "go") {
    for (const match of text.matchAll(/\bimport\s+(?:\(\s*([\s\S]*?)\s*\)|"([^"]+)")/g)) {
      const block = match[1];
      if (block) {
        for (const entry of block.matchAll(/"([^"]+)"/g)) if (entry[1]) imports.add(entry[1]);
      }
      if (match[2]) imports.add(match[2]);
    }
  }

  if (language === "ruby") {
    for (const match of text.matchAll(/^\s*require(?:_relative)?\s+["']([^"']+)["']/gm)) {
      if (match[1]) imports.add(match[1]);
    }
  }

  if (language === "java") {
    for (const match of text.matchAll(/^\s*import\s+(?:static\s+)?([A-Za-z0-9_.*]+)\s*;/gm)) {
      if (match[1]) imports.add(match[1]);
    }
  }

  if (language === "rust") {
    for (const match of text.matchAll(/^\s*(?:pub\s+)?(?:use|mod)\s+([^;]+);/gm)) {
      if (match[1]) imports.add(match[1].trim());
    }
  }

  return [...imports].filter(Boolean).sort();
}

function extractLexicalExports(language: SourceLanguage | null, text: string): string[] {
  const exports = new Set<string>();

  if (language === "python") {
    for (const match of text.matchAll(/^(?:async\s+)?(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/gm)) {
      if (match[1]) exports.add(match[1]);
    }
  }

  if (language === "go") {
    for (const match of text.matchAll(/^\s*(?:func\s+(?:\([^)]*\)\s*)?|type\s+)([A-Za-z_][A-Za-z0-9_]*)/gm)) {
      if (match[1]) exports.add(match[1]);
    }
  }

  if (language === "ruby") {
    for (const match of text.matchAll(/^\s*(?:class|module|def)\s+([A-Za-z_][A-Za-z0-9_:!?=.]*|self\.[A-Za-z_][A-Za-z0-9_!?=]*)/gm)) {
      if (match[1]) exports.add(match[1]);
    }
  }

  if (language === "java") {
    for (const match of text.matchAll(/\b(?:class|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
      if (match[1]) exports.add(match[1]);
    }
    for (const match of text.matchAll(/\b(?:public|protected|private)\s+(?:static\s+)?(?:final\s+)?[A-Za-z0-9_<>, ?\[\]]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
      if (match[1] && !["if", "for", "while", "switch", "catch"].includes(match[1])) exports.add(match[1]);
    }
  }

  if (language === "rust") {
    for (const match of text.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:fn|struct|enum|trait|mod)\s+([A-Za-z_][A-Za-z0-9_]*)/gm)) {
      if (match[1]) exports.add(match[1]);
    }
  }

  return [...exports].sort();
}

function lexicalComplexity(text: string): number {
  let complexity = 1;
  for (const match of text.matchAll(/\b(if|elif|else if|for|while|case|catch|except|rescue|when|match|switch)\b/g)) {
    if (match[1]) complexity += 1;
  }
  for (const match of text.matchAll(/&&|\|\|/g)) {
    if (match[0]) complexity += 1;
  }
  return complexity;
}
