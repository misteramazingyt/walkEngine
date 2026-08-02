"use client";

import { useWorkbenchStore } from "@/state/workbench-store";
import type { WalkProjectDto } from "@/server/projects";

// Bottom panel. In Phase 1 there are no nodes or edges to inspect yet, so it
// reports project provenance honestly; from Phase 2 on it renders the factual
// dossier for a selected node and the warrant breakdown for a selected edge.

export function InspectorPanel({ project }: { project: WalkProjectDto }) {
  const selection = useWorkbenchStore((s) => s.selection);

  return (
    <div className="flex items-start gap-6 px-3 py-2 text-[12px]">
      <div>
        <span className="font-bold">Selection:</span>{" "}
        {selection
          ? `${selection.kind} ${selection.id}`
          : "nothing selected — click a node or edge in the flowchart once a walk exists"}
      </div>
      <div className="text-ink-dim">
        <span className="font-bold text-ink">Project:</span> {project.id} ·
        created {new Date(project.createdAt).toLocaleString()} · status{" "}
        {project.status} · seed “{project.configuration.seed}”
      </div>
      <div className="text-ink-dim">
        Evidence excerpts, Wikidata metadata, actor horizon, and warrant
        inspection appear here from Phase 2 onward.
      </div>
    </div>
  );
}
