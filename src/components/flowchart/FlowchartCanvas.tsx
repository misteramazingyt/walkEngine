"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { SourceNodeDto } from "@/server/walks";
import { useWorkbenchStore } from "@/state/workbench-store";

// The visited walk path. Edges here are labeled ADJACENCY on purpose: a
// hyperlink hop is never evidence of causation, influence, or reception.
// Warranted, typed narrative edges arrive with Phase 4's orchestration.

type SourceFlowNode = Node<{ node: SourceNodeDto }, "sourceNode">;

function SourceNodeCard({ data, selected }: NodeProps<SourceFlowNode>) {
  const { node } = data;
  return (
    <div
      className={`bevel-out w-52 px-2 py-1.5 text-left ${
        selected ? "ring-2 ring-accent" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[12px] font-bold">{node.title}</span>
        <span className="shrink-0 bg-titlebar px-1 text-[10px] font-bold text-titlebar-text">
          {node.visitIndex}
        </span>
      </div>
      <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-ink-dim">
        {node.summary || "No summary available."}
      </p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { sourceNode: SourceNodeCard };

export function FlowchartCanvas({
  sourceNodes,
}: {
  sourceNodes: SourceNodeDto[];
}) {
  const setSelection = useWorkbenchStore((s) => s.setSelection);

  const { nodes, edges } = useMemo(() => {
    const nodes: SourceFlowNode[] = sourceNodes.map((node, i) => ({
      id: node.id,
      type: "sourceNode",
      position: { x: i * 260, y: 60 + (i % 2) * 90 },
      data: { node },
    }));
    const edges: Edge[] = sourceNodes.slice(1).map((node, i) => ({
      id: `${sourceNodes[i].id}->${node.id}`,
      source: sourceNodes[i].id,
      target: node.id,
      label: "ADJACENCY",
      labelStyle: { fontSize: 9, fill: "var(--color-ink-dim)" },
      style: { stroke: "var(--color-bevel-dark)" },
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-bevel-dark)" },
    }));
    return { nodes, edges };
  }, [sourceNodes]);

  return (
    <div className="bevel-in relative m-2 min-h-0 flex-1">
      <ReactFlow
        key={sourceNodes.map((n) => n.id).join("|") || "empty"}
        defaultNodes={nodes}
        defaultEdges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        proOptions={{ hideAttribution: false }}
        className="!bg-transparent"
        onNodeClick={(_e, node) => setSelection({ kind: "node", id: node.id })}
        onPaneClick={() => setSelection(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {sourceNodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="bevel-out max-w-sm px-4 py-3 text-center text-[12px] text-ink-dim">
            <p className="font-bold">No walk yet.</p>
            <p className="mt-1">
              Configure the walk above and press Generate walk. Visited
              articles will appear here as an adjacency path; orchestrated
              narrative nodes and warranted, typed edges follow in Phase 4.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
