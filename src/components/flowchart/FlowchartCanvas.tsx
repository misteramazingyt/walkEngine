"use client";

import { Background, BackgroundVariant, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// Phase 1: an empty, honest canvas. Narrative nodes and typed edges arrive
// with Phases 2 and 4; selection will drive the inspector via the
// workbench store.

export function FlowchartCanvas() {
  return (
    <div className="bevel-in relative m-2 min-h-0 flex-1">
      <ReactFlow
        nodes={[]}
        edges={[]}
        proOptions={{ hideAttribution: false }}
        className="!bg-transparent"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="bevel-out max-w-sm px-4 py-3 text-center text-[12px] text-ink-dim">
          <p className="font-bold">No walk yet.</p>
          <p className="mt-1">
            Configure the walk above and generate it (Phase 2). Visited nodes
            will appear here; orchestrated narrative nodes and warranted,
            typed edges follow in Phase 4.
          </p>
        </div>
      </div>
    </div>
  );
}
