import { extractAstSummaries } from "./ast.js";

const summaries = extractAstSummaries([
  {
    path: "src/example.ts",
    content: 'import x from "./x"; export function f(a: boolean) { if (a) return 1; return 0 }',
  },
  {
    path: "src/example.tsx",
    content:
      'import React from "react"; export function View() { return <main data-id="ok">Codebrief</main> }',
  },
]);

const ts = summaries.find((summary) => summary.path.endsWith(".ts"));
if (!ts || !ts.imports.includes("./x") || !ts.exports.includes("f") || ts.complexity !== 2 || ts.parseError) {
  throw new Error(`Unexpected TypeScript AST summary: ${JSON.stringify(ts)}`);
}

const tsx = summaries.find((summary) => summary.path.endsWith(".tsx"));
if (!tsx || !tsx.imports.includes("react") || !tsx.exports.includes("View") || tsx.parseError) {
  throw new Error(`Unexpected TSX AST summary: ${JSON.stringify(tsx)}`);
}

process.stdout.write("ast tests passed\n");
