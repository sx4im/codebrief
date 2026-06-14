"use client";

import { useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, type Edge, type Node, type NodeMouseHandler } from "reactflow";
import "reactflow/dist/style.css";
import type { ArchitectureDiagram as Diagram, Landmine, Severity } from "@codebrief/shared";
import { SourceList } from "@/components/brief/SourceList";
import { Button } from "@/components/ui/Button";

export function ArchitectureDiagram({ diagram, landmines = [] }: { diagram: Diagram; landmines?: Landmine[] }) {
  const [edgeMode, setEdgeMode] = useState<"all" | "coupling">("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(diagram.nodes[0]?.id || null);
  const selectedNode = diagram.nodes.find((node) => node.id === selectedNodeId) || diagram.nodes[0] || null;
  const selectedLandmines = useMemo(() => (selectedNode ? landminesForNode(landmines, selectedNode.path) : []), [landmines, selectedNode]);

  const nodes: Node[] = useMemo(
    () =>
      diagram.nodes.map((node, index) => ({
        id: node.id,
        position: { x: (index % 4) * 260, y: Math.floor(index / 4) * 170 },
        data: { label: `${node.label} (${node.landmineCount})` },
        style: {
          background: severityColor(node.severity),
          border: node.id === selectedNodeId ? "1px solid #3b82f6" : "1px solid #2a2a2a",
          boxShadow: severityGlow(node.severity, node.id === selectedNodeId),
          color: "#f4f4f5",
          borderRadius: 4,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
        },
      })),
    [diagram.nodes, selectedNodeId],
  );

  const edges: Edge[] = useMemo(
    () =>
      diagram.edges
        .filter((edge) => edgeMode === "all" || edge.kind === "coupling")
        .map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          animated: edge.kind === "coupling",
          label: edge.weight && edge.weight > 1 ? `${edge.kind} ×${edge.weight}` : edge.kind,
          style: { stroke: edge.kind === "coupling" ? "#f59e0b" : "#3b82f6", strokeWidth: edgeStrokeWidth(edge.weight) },
          labelStyle: { fill: "#a1a1aa", fontFamily: "var(--font-mono)", fontSize: 10 },
        })),
    [diagram.edges, edgeMode],
  );

  const onNodeClick: NodeMouseHandler = (_, node) => setSelectedNodeId(node.id);

  return (
    <section id="diagram" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-xl font-semibold">Architecture Diagram</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Pan, zoom, select modules, and isolate coupling edges when planning changes.</p>
        </div>
        <div className="flex rounded border border-border bg-panel p-1">
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
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="h-[560px] rounded border border-border bg-panel">
          <ReactFlow nodes={nodes} edges={edges} fitView onNodeClick={onNodeClick}>
            <Background color="#2a2a2a" />
            <MiniMap
              nodeColor={(node) => {
                const match = diagram.nodes.find((item) => item.id === node.id);
                return severityColor(match?.severity);
              }}
            />
            <Controls />
          </ReactFlow>
        </div>
        <aside className="rounded border border-border bg-panel p-4">
          {selectedNode ? (
            <div>
              <div className="font-mono text-xs uppercase text-muted">Selected module</div>
              <h3 className="mt-2 font-mono text-lg font-semibold">{selectedNode.label}</h3>
              <div className="mt-1 break-all font-mono text-xs text-blue">{selectedNode.path}</div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <Metric label="Severity" value={selectedNode.severity || "low"} />
                <Metric label="Landmines" value={String(selectedNode.landmineCount)} />
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <div className="font-mono text-xs uppercase text-muted">Associated landmines</div>
                {selectedLandmines.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {selectedLandmines.map((landmine) => (
                      <div key={`${landmine.location}-${landmine.category}-${landmine.priority}`} className="rounded border border-border bg-background p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`rounded border px-2 py-1 text-xs ${severityClass(landmine.severity)}`}>{landmine.severity}</span>
                          <span className="font-mono text-xs text-muted">P{landmine.priority}</span>
                        </div>
                        <div className="mt-2 font-mono text-xs text-blue">{landmine.location}</div>
                        <p className="mt-2 text-sm leading-6 text-zinc-300">{landmine.explanation}</p>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background p-3">
      <div className="font-mono text-[11px] uppercase text-muted">{label}</div>
      <div className="mt-1 font-mono text-sm text-text">{value}</div>
    </div>
  );
}

function edgeStrokeWidth(weight?: number): number {
  if (!weight || weight <= 1) return 1;
  return Math.min(5, 1 + Math.log2(weight));
}

function landminesForNode(landmines: Landmine[], path: string): Landmine[] {
  return landmines.filter((landmine) => landmine.location === path || landmine.location.startsWith(`${path}/`) || path.startsWith(`${landmine.location}/`));
}

function severityColor(severity?: string): string {
  if (severity === "critical") return "#7f1d1d";
  if (severity === "high") return "#9a3412";
  if (severity === "medium") return "#713f12";
  return "#14532d";
}

function severityGlow(severity: Severity | undefined, selected: boolean): string {
  const focus = selected ? "0 0 0 2px rgba(59, 130, 246, 0.45)" : "";
  if (severity === "critical" || severity === "high") return `${focus}${focus ? "," : ""} 0 0 18px rgba(239, 68, 68, 0.32)`;
  if (severity === "medium") return `${focus}${focus ? "," : ""} 0 0 14px rgba(245, 158, 11, 0.24)`;
  return focus || "none";
}

function severityClass(severity: Severity): string {
  if (severity === "critical") return "border-danger/70 bg-danger/15 text-red-200";
  if (severity === "high") return "border-orange-500/70 bg-orange-500/15 text-orange-200";
  if (severity === "medium") return "border-amber/70 bg-amber/15 text-amber";
  return "border-border bg-panel2 text-muted";
}
