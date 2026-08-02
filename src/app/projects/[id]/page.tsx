"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";
import { fetchProject, updateProjectRequest } from "@/lib/api";
import type { WalkConfiguration } from "@/schemas/walk-configuration";
import { WalkConfigurationForm } from "@/components/configuration/WalkConfigurationForm";
import { FlowchartCanvas } from "@/components/flowchart/FlowchartCanvas";
import { DraftPanel } from "@/components/draft/DraftPanel";
import { InspectorPanel } from "@/components/inspector/InspectorPanel";
import { Panel, TitleBar } from "@/components/ui/retro";

// Conceptual menu labels from the spec. Only "File" does anything in
// Phase 1 (returns to the project shelf); the rest are rendered visibly
// inert with the phase that activates them.
const MENUS: Array<{ label: string; activatesIn?: string }> = [
  { label: "File" },
  { label: "Walk", activatesIn: "Phase 2" },
  { label: "Arrange", activatesIn: "Phase 4" },
  { label: "Motifs", activatesIn: "Phase 6" },
  { label: "Evidence", activatesIn: "Phase 4" },
  { label: "Narrative", activatesIn: "Phase 5" },
  { label: "Export", activatesIn: "Phase 7" },
];

export default function ProjectWorkbenchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const projectQuery = useQuery({
    queryKey: ["project", id],
    queryFn: () => fetchProject(id),
  });

  // null = no local edits; the persisted configuration is authoritative.
  const [draftConfig, setDraftConfig] = useState<WalkConfiguration | null>(null);

  const saveMutation = useMutation({
    mutationFn: (configuration: WalkConfiguration) =>
      updateProjectRequest(id, { configuration }),
    onSuccess: (project) => {
      queryClient.setQueryData(["project", id], project);
      setDraftConfig(null);
    },
  });

  if (projectQuery.isLoading) {
    return (
      <main className="p-6 text-[12px] text-ink-dim">Loading project…</main>
    );
  }

  if (projectQuery.isError || !projectQuery.data) {
    return (
      <main className="p-6">
        <div className="bevel-out max-w-md p-[3px]">
          <TitleBar title="Project unavailable" inactive />
          <div className="px-4 py-3 text-[12px]">
            <p className="text-warn">
              {projectQuery.error?.message ?? "Project not found."}
            </p>
            <p className="mt-2">
              <Link href="/" className="text-accent underline">
                Return to the project shelf
              </Link>
            </p>
          </div>
        </div>
      </main>
    );
  }

  const project = projectQuery.data;
  const config = draftConfig ?? project.configuration;
  const dirty =
    JSON.stringify(config) !== JSON.stringify(project.configuration);

  return (
    <main className="flex h-full flex-col gap-1.5 p-2">
      <div className="bevel-out shrink-0 p-[3px]">
        <TitleBar
          title={`MOTIF WALK — ${project.title}`}
          right={
            <span className="text-[11px] font-normal">
              {project.mode} · {project.status}
            </span>
          }
        />
        <nav className="flex gap-4 px-2 py-1 text-[12px]">
          {MENUS.map((menu) =>
            menu.activatesIn ? (
              <span
                key={menu.label}
                className="cursor-not-allowed text-ink-dim"
                title={`Activates in ${menu.activatesIn}`}
              >
                {menu.label}
              </span>
            ) : (
              <Link key={menu.label} href="/" className="hover:underline">
                {menu.label}
              </Link>
            ),
          )}
        </nav>
      </div>

      <Panel
        title="Walk configuration"
        className="max-h-[42vh] shrink-0"
        titleRight={
          <span className="text-[11px] font-normal">
            seed “{config.seed}” · persisted per project
          </span>
        }
      >
        <WalkConfigurationForm
          value={config}
          onChange={setDraftConfig}
          onSave={() => saveMutation.mutate(config)}
          saving={saveMutation.isPending}
          dirty={dirty}
          saveError={
            saveMutation.isError ? saveMutation.error.message : null
          }
        />
      </Panel>

      <div className="flex min-h-0 flex-1 gap-1.5">
        <Panel title="Editable flowchart" className="min-w-0 flex-[3]">
          <div className="flex h-full flex-col">
            <FlowchartCanvas />
          </div>
        </Panel>
        <Panel title="Draft 0" className="min-w-0 flex-[2]">
          <DraftPanel />
        </Panel>
      </div>

      <Panel title="Evidence / transition inspector" className="h-24 shrink-0">
        <InspectorPanel project={project} />
      </Panel>
    </main>
  );
}
