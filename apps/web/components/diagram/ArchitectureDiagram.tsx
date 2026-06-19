"use client";

import { useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  MarkerType,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import type { ArchitectureDiagram as Diagram, Landmine, Severity } from "@codebrief/shared";
import { SourceList } from "@/components/brief/SourceList";
import { Button } from "@/components/ui/Button";
import { severityBadgeClass, severityHex } from "@/lib/severity";

// Edge palette (cream/white canvas): dependency = calm blue, coupling = amber.
const DEP_COLOR = "#3b82f6";
const COUPLING_COLOR = "#d97706";

// Layout geometry. Nodes are laid out by graph structure (see computeLayout),
// not by reading order, so dependency edges flow top-to-bottom instead of
// crossing arbitrarily.
const NODE_W = 210;
const NODE_H = 84;
const X_GAP = 56;
const Y_GAP = 64;
const BLOCK_GAP = 40;

type ModuleNodeData = {
  title: string;
  subtitle: string;
  severity?: Severity;
  landmineCount: number;
};

const nodeTypes = { module: ModuleNode };

// Stable empty default so an omitted `landmines` prop reuses one reference instead
// of allocating a fresh [] each render (which would bust the useMemo deps below).
const EMPTY_LANDMINES: Landmine[] = [];

export function ArchitectureDiagram({ diagram, landmines = EMPTY_LANDMINES }: { diagram: Diagram; landmines?: Landmine[] }) {
  const [edgeMode, setEdgeMode] = useState<"all" | "coupling">("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(diagram.nodes[0]?.id || null);
  const selectedNode = diagram.nodes.find((node) => node.id === selectedNodeId) || diagram.nodes[0] || null;
  const selectedLandmines = useMemo(() => (selectedNode ? landminesForNode(landmines, selectedNode.path) : []), [landmines, selectedNode]);

  // Layout depends only on the diagram, so selecting a node never reflows it.
  const positions = useMemo(() => computeLayout(diagram), [diagram]);

  const connectedEdgeIds = useMemo(
    () =>
      selectedNodeId
        ? new Set(
            diagram.edges.flatMap((edge) =>
              edge.source === selectedNodeId || edge.target === selectedNodeId ? [edge.id] : [],
            ),
          )
        : null,
    [diagram.edges, selectedNodeId],
  );

  const nodes: Node<ModuleNodeData>[] = useMemo(
    () =>
      diagram.nodes.map((node) => ({
        id: node.id,
        type: "module",
        position: positions.get(node.id) ?? { x: 0, y: 0 },
        selected: node.id === selectedNodeId,
        data: {
          title: titleOf(node.path),
          subtitle: subtitleOf(node.path),
          severity: node.severity,
          landmineCount: node.landmineCount,
        },
      })),
    [diagram.nodes, positions, selectedNodeId],
  );

  const edges: Edge[] = useMemo(
    () =>
      diagram.edges
        .filter((edge) => edgeMode === "all" || edge.kind === "coupling")
        .map((edge) => {
          const color = edge.kind === "coupling" ? COUPLING_COLOR : DEP_COLOR;
          const dimmed = connectedEdgeIds ? !connectedEdgeIds.has(edge.id) : false;
          return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: "smoothstep",
            animated: edge.kind === "coupling" && !dimmed,
            label: edge.weight && edge.weight > 1 ? `×${edge.weight}` : undefined,
            markerEnd:
              edge.kind === "dependency"
                ? { type: MarkerType.ArrowClosed, color, width: 16, height: 16 }
                : undefined,
            style: {
              stroke: color,
              strokeWidth: edgeStrokeWidth(edge.weight),
              strokeDasharray: edge.kind === "coupling" ? "5 4" : undefined,
              opacity: dimmed ? 0.16 : 0.85,
            },
            labelStyle: { fill: "#646464", fontFamily: "var(--font-mono)", fontSize: 10 },
            labelBgStyle: { fill: "#f3f0e8", fillOpacity: 0.9 },
            labelBgPadding: [4, 2] as [number, number],
          } satisfies Edge;
        }),
    [diagram.edges, edgeMode, connectedEdgeIds],
  );

  const onNodeClick: NodeMouseHandler = (_, node) => setSelectedNodeId(node.id);

  return (
    <section id="diagram" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink">Architecture diagram</h2>
          <p className="mt-2 text-sm leading-6 text-charcoal">
            Modules are laid out by dependency flow. Pan, zoom, and select a module to inspect its landmines; isolate coupling edges when planning changes.
          </p>
        </div>
        <div className="flex rounded-full border border-border bg-card p-1">
          <Button
            type="button"
            variant={edgeMode === "all" ? "primary" : "ghost"}
            onClick={() => setEdgeMode("all")}
            className="h-8 border-transparent px-3 text-xs"
          >
            All deps
          </Button>
          <Button
            type="button"
            variant={edgeMode === "coupling" ? "primary" : "ghost"}
            onClick={() => setEdgeMode("coupling")}
            className="h-8 border-transparent px-3 text-xs"
          >
            Coupling only
          </Button>
        </div>
      </div>

      <DiagramLegend />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="h-[600px] overflow-hidden rounded-lg border border-border bg-bone">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.22 }}
            minZoom={0.15}
            maxZoom={1.6}
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
            onNodeClick={onNodeClick}
          >
            <Background color="#d8d2c4" gap={22} size={1} />
            <MiniMap
              pannable
              zoomable
              maskColor="rgba(249,247,243,0.6)"
              style={{ background: "#ffffff", border: "1px solid rgba(32,32,32,0.12)" }}
              nodeColor={(node) => accentFor(diagram.nodes.find((item) => item.id === node.id)?.severity)}
              nodeStrokeWidth={0}
            />
            <Controls className="!border-border !bg-card" />
          </ReactFlow>
        </div>

        <aside className="rounded-lg border border-border bg-panel p-4">
          {selectedNode ? (
            <div>
              <div className="font-mono text-xs uppercase tracking-wide text-muted">Selected module</div>
              <h3 className="mt-2 break-all font-mono text-lg font-semibold text-ink">{titleOf(selectedNode.path)}</h3>
              {subtitleOf(selectedNode.path) ? (
                <div className="mt-1 break-all font-mono text-xs text-charcoal">{selectedNode.path}</div>
              ) : null}
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <Metric label="Severity" value={selectedNode.severity || "no risk"} accent={accentFor(selectedNode.severity)} />
                <Metric label="Landmines" value={String(selectedNode.landmineCount)} />
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <div className="font-mono text-xs uppercase tracking-wide text-muted">Associated landmines</div>
                {selectedLandmines.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {selectedLandmines.map((landmine) => (
                      <div key={`${landmine.location}-${landmine.category}-${landmine.priority}`} className="rounded-md border border-border bg-bone/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${severityBadgeClass[landmine.severity]}`}>{landmine.severity}</span>
                          <span className="font-mono text-xs text-mute">P{landmine.priority}</span>
                        </div>
                        <div className="mt-2 break-all font-mono text-xs text-ink">{landmine.location}</div>
                        <p className="mt-2 text-sm leading-6 text-body">{landmine.explanation}</p>
                        <SourceList sources={landmine.evidence} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-muted">No landmine evidence is attached to this module.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted">No diagram nodes were generated for this brief.</p>
          )}
        </aside>
      </div>
    </section>
  );
}

function ModuleNode({ data, selected }: NodeProps<ModuleNodeData>) {
  const accent = accentFor(data.severity);
  const emphasize = data.severity === "critical" || data.severity === "high";
  return (
    <div
      className={`w-[210px] rounded-md border bg-card px-3 py-2.5 transition-shadow ${selected ? "border-ink" : "border-border"}`}
      style={{
        borderLeft: `3px solid ${accent}`,
        boxShadow: selected
          ? "0 0 0 2px rgba(32,32,32,0.45)"
          : emphasize
            ? `0 6px 16px ${accent}22`
            : "0 1px 2px rgba(32,32,32,0.08)",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ width: 7, height: 7, background: "#bbbbbb", border: "none" }} />
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} aria-hidden />
        <span className="truncate font-mono text-[13px] font-semibold text-text" title={data.subtitle || data.title}>
          {data.title}
        </span>
      </div>
      {data.subtitle ? <div className="mt-1 truncate font-mono text-[10px] text-muted">{data.subtitle}</div> : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{data.severity ?? "no risk"}</span>
        {data.landmineCount > 0 ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[10px]"
            style={{ borderColor: `${accent}66`, color: accent }}
          >
            ▲ {data.landmineCount}
          </span>
        ) : null}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ width: 7, height: 7, background: "#bbbbbb", border: "none" }} />
    </div>
  );
}

function DiagramLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-border bg-card px-3 py-2 text-[11px] text-charcoal">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {(["critical", "high", "medium", "low"] as const).map((severity) => (
          <span key={severity} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: accentFor(severity) }} />
            <span className="capitalize">{severity}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: accentFor(undefined) }} />
          No risk
        </span>
      </div>
      <div className="flex items-center gap-x-4">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-5 border-t-2" style={{ borderColor: DEP_COLOR }} />
          Dependency
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-5 border-t-2 border-dashed" style={{ borderColor: COUPLING_COLOR }} />
          Coupling
        </span>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded border border-border bg-background p-3">
      <div className="font-mono text-[11px] uppercase text-muted">{label}</div>
      <div className="mt-1 flex items-center gap-1.5">
        {accent ? <span className="h-2 w-2 rounded-full" style={{ background: accent }} aria-hidden /> : null}
        <span className="font-mono text-sm capitalize text-text">{value}</span>
      </div>
    </div>
  );
}

// Layered (Sugiyama-style) layout: assign each module a layer by the longest
// dependency path reaching it, order within layers to reduce crossings, and
// center each row. Fully disconnected modules drop into a tidy grid below the
// connected structure (which also covers repos whose modules have no resolved
// cross-module imports — most of them — so they read as a clean grid, not a
// fixed index grid with edges crossing through it).
function computeLayout(diagram: Diagram): Map<string, { x: number; y: number }> {
  const ids = diagram.nodes.map((node) => node.id);
  const positions = new Map<string, { x: number; y: number }>();
  if (ids.length === 0) return positions;
  const idSet = new Set(ids);

  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  ids.forEach((id) => {
    children.set(id, []);
    parents.set(id, []);
  });
  const seenPair = new Set<string>();
  for (const edge of diagram.edges) {
    if (edge.kind !== "dependency" || edge.source === edge.target) continue;
    if (!idSet.has(edge.source) || !idSet.has(edge.target)) continue;
    const key = `${edge.source} ${edge.target}`;
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    children.get(edge.source)!.push(edge.target);
    parents.get(edge.target)!.push(edge.source);
  }

  // Topological order via DFS; back edges are skipped so cycles can't wedge the
  // longest-path pass below.
  const mark = new Map<string, 0 | 1 | 2>();
  ids.forEach((id) => mark.set(id, 0));
  const post: string[] = [];
  const visit = (u: string) => {
    mark.set(u, 1);
    for (const v of children.get(u)!) if (mark.get(v) === 0) visit(v);
    mark.set(u, 2);
    post.push(u);
  };
  for (const id of ids) if (mark.get(id) === 0) visit(id);
  const topo = [...post].reverse();
  const topoIdx = new Map<string, number>();
  topo.forEach((id, i) => topoIdx.set(id, i));

  const layer = new Map<string, number>();
  ids.forEach((id) => layer.set(id, 0));
  for (const u of topo)
    for (const v of children.get(u)!)
      if (topoIdx.get(v)! > topoIdx.get(u)! && layer.get(v)! < layer.get(u)! + 1) layer.set(v, layer.get(u)! + 1);

  const connectedIds = ids.filter((id) => children.get(id)!.length > 0 || parents.get(id)!.length > 0);
  const isolatedIds = ids.filter((id) => children.get(id)!.length === 0 && parents.get(id)!.length === 0);

  // Forward-only adjacency (back edges removed) drives crossing reduction.
  const fwdChildren = new Map<string, string[]>();
  const fwdParents = new Map<string, string[]>();
  ids.forEach((id) => {
    fwdChildren.set(id, []);
    fwdParents.set(id, []);
  });
  for (const u of ids)
    for (const v of children.get(u)!)
      if (topoIdx.get(v)! > topoIdx.get(u)!) {
        fwdChildren.get(u)!.push(v);
        fwdParents.get(v)!.push(u);
      }

  const layers: string[][] = [];
  for (const id of connectedIds) (layers[layer.get(id)!] ||= []).push(id);

  const orderIdx = new Map<string, number>();
  const reindex = () => layers.forEach((l) => l && l.forEach((id, i) => orderIdx.set(id, i)));
  reindex();
  const barycenter = (id: string, rel: Map<string, string[]>) => {
    const neighbours = rel.get(id)!;
    return neighbours.length ? neighbours.reduce((sum, n) => sum + (orderIdx.get(n) ?? 0), 0) / neighbours.length : (orderIdx.get(id) ?? 0);
  };
  for (let sweep = 0; sweep < 4; sweep++) {
    const downward = sweep % 2 === 0;
    const rel = downward ? fwdParents : fwdChildren;
    const indices = layers.map((_, i) => i);
    if (!downward) indices.reverse();
    for (const li of indices) {
      const l = layers[li];
      if (l && l.length > 1) {
        l.sort((a, b) => barycenter(a, rel) - barycenter(b, rel));
        reindex();
      }
    }
  }

  // Cap how wide any single row gets. A layer with many roots (e.g. a wide
  // fan-in) would otherwise stretch into one long row and force fitView to zoom
  // out until labels are unreadable; wrapping it into balanced sub-rows keeps the
  // graph roughly square and legible without breaking the top-to-bottom flow.
  const MAX_PER_ROW = 6;
  const wrap = (row: string[]): string[][] => {
    if (row.length <= MAX_PER_ROW) return [row];
    const rowCount = Math.ceil(row.length / MAX_PER_ROW);
    const perRow = Math.ceil(row.length / rowCount);
    const out: string[][] = [];
    for (let i = 0; i < row.length; i += perRow) out.push(row.slice(i, i + perRow));
    return out;
  };
  const connectedRows = layers.flatMap((l) => (l && l.length ? wrap(l) : []));
  const widestConnected = Math.max(0, ...connectedRows.map((l) => l.length));
  const cols = Math.min(MAX_PER_ROW, Math.max(widestConnected, Math.ceil(Math.sqrt(isolatedIds.length)) || 0, 1));
  const isolatedRows: string[][] = [];
  for (let i = 0; i < isolatedIds.length; i += cols) isolatedRows.push(isolatedIds.slice(i, i + cols));

  const allRows = [...connectedRows, ...isolatedRows];
  const widest = Math.max(1, ...allRows.map((row) => row.length));
  const totalW = widest * NODE_W + (widest - 1) * X_GAP;
  const place = (rows: string[][], startY: number) => {
    let y = startY;
    for (const row of rows) {
      const rowW = row.length * NODE_W + (row.length - 1) * X_GAP;
      const startX = (totalW - rowW) / 2;
      row.forEach((id, i) => positions.set(id, { x: startX + i * (NODE_W + X_GAP), y }));
      y += NODE_H + Y_GAP;
    }
    return y;
  };
  let y = place(connectedRows, 0);
  if (connectedRows.length && isolatedRows.length) y += BLOCK_GAP;
  place(isolatedRows, y);
  return positions;
}

function titleOf(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

function subtitleOf(path: string): string {
  return path.split("/").filter(Boolean).length > 1 ? path : "";
}

function edgeStrokeWidth(weight?: number): number {
  if (!weight || weight <= 1) return 1.5;
  return Math.min(5, 1.5 + Math.log2(weight));
}

function landminesForNode(landmines: Landmine[], path: string): Landmine[] {
  return landmines.filter((landmine) => landmine.location === path || landmine.location.startsWith(`${path}/`) || path.startsWith(`${landmine.location}/`));
}

function accentFor(severity?: string): string {
  if (severity === "critical" || severity === "high" || severity === "medium" || severity === "low") {
    return severityHex[severity];
  }
  return severityHex.none;
}
