"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import {
  fetchProject,
  fetchWalk,
  startWalkRequest,
  updateProjectRequest,
} from "@/lib/api";
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

  const walkQuery = useQuery({
    queryKey: ["walk", id],
    queryFn: () => fetchWalk(id),
    // Poll while a walk job is in flight; settle once it finishes.
    refetchInterval: (query) => {
      const job = query.state.data?.latestJob;
      return job && (job.status === "QUEUED" || job.status === "RUNNING")
        ? 1200
        : false;
    },
  });

  const walkBusy =
    walkQuery.data?.latestJob?.status === "QUEUED" ||
    walkQuery.data?.latestJob?.status === "RUNNING";

  const startWalkMutation = useMutation({
    mutationFn: (mode: "fresh" | "same-seed") => startWalkRequest(id, { mode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["walk", id] });
      queryClient.invalidateQueries({ queryKey: ["project", id] });
    },
  });

  // Refresh project status (WALKING → WALK_READY / FAILED) once the job settles.
  const latestJobStatus = walkQuery.data?.latestJob?.status;
  useEffect(() => {
    if (latestJobStatus === "COMPLETE" || latestJobStatus === "FAILED") {
      void queryClient.invalidateQueries({ queryKey: ["project", id] });
    }
  }, [latestJobStatus, queryClient, id]);

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
    // Desktop (lg+): fixed-viewport workbench with internal panel scrolling.
    // Phone/tablet: panels stack and the document itself scrolls.
    <main className="flex min-h-full flex-col gap-1.5 p-2 lg:h-full">
      <div className="bevel-out shrink-0 p-[3px]">
        <TitleBar
          title={`MOTIF WALK — ${project.title}`}
          right={
            <span className="text-[11px] font-normal">
              {project.mode} · {project.status}
            </span>
          }
        />
        <nav className="flex flex-wrap gap-x-4 gap-y-1 px-2 py-1 text-[12px]">
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
        className="max-h-[60vh] shrink-0 lg:max-h-[42vh]"
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
          walk={{
            onGenerate: () => startWalkMutation.mutate("fresh"),
            onRegenerateSameSeed: () => startWalkMutation.mutate("same-seed"),
            busy: walkBusy || startWalkMutation.isPending,
            hasWalk: (walkQuery.data?.sourceNodes.length ?? 0) > 0,
            jobLabel: walkQuery.data?.latestJob
              ? `${walkQuery.data.latestJob.status}: ${walkQuery.data.latestJob.currentStep}`
              : null,
            error:
              startWalkMutation.error?.message ??
              (walkQuery.data?.latestJob?.status === "FAILED"
                ? (walkQuery.data.latestJob.error ?? "unknown failure")
                : null),
          }}
        />
      </Panel>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 lg:flex-row">
        <Panel
          title="Editable flowchart"
          className="h-[60vh] min-w-0 shrink-0 lg:h-auto lg:min-h-0 lg:flex-[3] lg:shrink"
        >
          <div className="flex h-full flex-col">
            <FlowchartCanvas sourceNodes={walkQuery.data?.sourceNodes ?? []} />
          </div>
        </Panel>
        <Panel
          title="Draft 0"
          className="h-[50vh] min-w-0 shrink-0 lg:h-auto lg:min-h-0 lg:flex-[2] lg:shrink"
        >
          <DraftPanel />
        </Panel>
      </div>

      <Panel
        title="Evidence / transition inspector"
        className="max-h-48 shrink-0 lg:h-24"
      >
        <InspectorPanel
          project={project}
          sourceNodes={walkQuery.data?.sourceNodes ?? []}
        />
      </Panel>
    </main>
  );
}
