import type { FileAstSummary, Landmine } from "@codebrief/shared";
import type { CouplingCluster } from "../analysis/coupling.js";
import { buildArchitectureDiagram } from "./diagram.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function astFile(path: string, imports: string[]): FileAstSummary {
  return { path, imports, exports: [], complexity: 2, nodeCount: 10, parseError: false };
}

// apps/web depends on packages/core (resolved through real files), with two
// distinct file-level imports so the aggregated edge weight is 2.
const astFiles: FileAstSummary[] = [
  astFile("apps/web/page.ts", ["../../packages/core/index.ts", "./util.ts"]),
  astFile("apps/web/dashboard.ts", ["../../packages/core/db.ts"]),
  astFile("apps/web/util.ts", []),
  astFile("packages/core/index.ts", ["./db.ts"]),
  astFile("packages/core/db.ts", []),
  // An unresolvable / external import must not create an edge.
  astFile("packages/core/api.ts", ["react", "./nonexistent.ts"]),
];

const landmines: Landmine[] = [
  {
    location: "packages/core/db.ts",
    category: "complexity-bomb",
    severity: "high",
    explanation: "Central data module.",
    evidence: [{ type: "file", path: "packages/core/db.ts" }],
    remediation: "Split into focused modules and add tests.",
    remediationEstimate: "1 week",
    priority: 1,
    confidence: 0.8,
  },
];

const coupling: CouplingCluster[] = [
  // Cross-module coupling -> a coupling edge between apps/web and packages/core.
  { files: ["apps/web/page.ts", "packages/core/db.ts"], coChanges: 7, probability: 0.6 },
  // Same-module coupling -> must NOT produce an edge.
  { files: ["packages/core/index.ts", "packages/core/db.ts"], coChanges: 9, probability: 0.8 },
];

const diagram = buildArchitectureDiagram(astFiles, landmines, coupling);

// --- Nodes ---
const nodeIds = new Set(diagram.nodes.map((node) => node.id));
assert(nodeIds.has("apps/web"), "expected apps/web module node");
assert(nodeIds.has("packages/core"), "expected packages/core module node");
assert(diagram.nodes.length === 2, `expected exactly 2 module nodes, got ${diagram.nodes.length}`);
const coreNode = diagram.nodes.find((node) => node.id === "packages/core");
assert(!!coreNode && coreNode.severity === "high" && coreNode.landmineCount === 1, "packages/core should carry landmine severity/count");

// --- Dependency edges: resolved + aggregated + weighted ---
const depEdges = diagram.edges.filter((edge) => edge.kind === "dependency");
const webToCore = depEdges.find((edge) => edge.source === "apps/web" && edge.target === "packages/core");
assert(!!webToCore, `expected apps/web -> packages/core dependency edge, got ${JSON.stringify(depEdges)}`);
assert(webToCore?.weight === 2, `expected aggregated weight 2 (two file imports), got ${webToCore?.weight}`);
// Internal apps/web import (./util.ts) is same-module and must not create an edge.
assert(!depEdges.some((edge) => edge.source === edge.target), "no self-loop dependency edges allowed");
// External "react" and unresolvable "./nonexistent.ts" must not create edges.
assert(depEdges.length === 1, `expected exactly 1 aggregated dependency edge, got ${depEdges.length}`);

// --- Coupling edges: cross-module only, weighted, canonical-ordered ---
const couplingEdges = diagram.edges.filter((edge) => edge.kind === "coupling");
assert(couplingEdges.length === 1, `expected exactly 1 cross-module coupling edge, got ${couplingEdges.length}`);
const couplingEdge = couplingEdges[0];
assert(
  !!couplingEdge && couplingEdge.source === "apps/web" && couplingEdge.target === "packages/core",
  "coupling edge endpoints should be canonical-ordered modules",
);
assert(couplingEdge?.weight === 7, `expected coupling weight 7 (co-change count), got ${couplingEdge?.weight}`);

// --- Edges only reference real nodes ---
for (const edge of diagram.edges) {
  assert(nodeIds.has(edge.source) && nodeIds.has(edge.target), `edge references unknown node: ${edge.id}`);
}

// --- Adaptive granularity: a single-app monorepo must not collapse to one node ---
const monorepoAst: FileAstSummary[] = [
  astFile("apps/v4/components/button.tsx", []),
  astFile("apps/v4/components/menu.tsx", []),
  astFile("apps/v4/app/page.tsx", ["../components/button.tsx"]),
  astFile("apps/v4/lib/utils.ts", []),
  astFile("apps/v4/registry/index.ts", []),
];
const monorepoDiagram = buildArchitectureDiagram(monorepoAst, [], []);
const monorepoIds = new Set(monorepoDiagram.nodes.map((node) => node.id));
assert(monorepoDiagram.nodes.length >= 3, `single-app monorepo should deepen to >=3 module nodes, got ${monorepoDiagram.nodes.length}`);
assert(monorepoIds.has("apps/v4/components"), "expected deepened apps/v4/components module node");
assert(!monorepoIds.has("apps/v4"), "should not collapse the whole app to one apps/v4 node");

// A repo with several top-level modules stays at the top level (no over-fragmenting).
const flatAst: FileAstSummary[] = [astFile("callbacks/create.go", []), astFile("schema/field.go", []), astFile("clause/where.go", [])];
const flatDiagram = buildArchitectureDiagram(flatAst, [], []);
const flatIds = new Set(flatDiagram.nodes.map((node) => node.id));
assert(flatIds.has("callbacks") && flatIds.has("schema") && flatIds.has("clause"), "top-level modules should be kept as-is");

process.stdout.write("diagram tests passed\n");
