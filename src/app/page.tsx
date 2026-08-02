"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createProjectRequest, fetchProjects } from "@/lib/api";
import { Panel, RetroButton, RetroInput, TitleBar } from "@/components/ui/retro";

export default function HomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const createMutation = useMutation({
    mutationFn: createProjectRequest,
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      router.push(`/projects/${project.id}`);
    },
  });

  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-4 p-3 sm:p-6">
      <div className="bevel-out p-[3px]">
        <TitleBar title="MOTIF WALK — Cultural Memory Workbench" />
        <div className="px-4 py-3 text-[12px] leading-relaxed">
          A narrative-path discovery instrument. The random walk discovers
          adjacency; the backward planner discovers explanatory necessity; the
          verifier discovers whether that necessity is historical, analogical,
          or merely narratively seductive.
        </div>
      </div>

      <Panel title="New project" className="shrink-0">
        <form
          className="flex flex-wrap items-center gap-2 px-3 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim().length === 0 || createMutation.isPending) return;
            createMutation.mutate({ title: title.trim() });
          }}
        >
          <label htmlFor="project-title" className="text-[12px]">
            Title
          </label>
          <RetroInput
            id="project-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. From touchstone to radar"
            className="flex-1"
            maxLength={200}
          />
          <RetroButton
            type="submit"
            primary
            disabled={title.trim().length === 0 || createMutation.isPending}
            disabledReason="Enter a title first"
          >
            {createMutation.isPending ? "Creating…" : "Create"}
          </RetroButton>
        </form>
        {createMutation.isError && (
          <p className="px-3 pb-2 text-[12px] text-warn">
            {createMutation.error.message}
          </p>
        )}
      </Panel>

      <Panel title="Projects" className="min-h-0 flex-1">
        {projectsQuery.isLoading && (
          <p className="px-3 py-3 text-[12px] text-ink-dim">Loading…</p>
        )}
        {projectsQuery.isError && (
          <p className="px-3 py-3 text-[12px] text-warn">
            Failed to load projects: {projectsQuery.error.message}
          </p>
        )}
        {projectsQuery.data && projectsQuery.data.length === 0 && (
          <p className="px-3 py-3 text-[12px] text-ink-dim">
            No projects yet. Create one above — it is persisted in SQLite and
            survives a browser refresh.
          </p>
        )}
        <ul>
          {projectsQuery.data?.map((project) => (
            <li
              key={project.id}
              className="border-b border-(--color-bevel-dark)/40"
            >
              <button
                className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-surface-raised"
                onClick={() => router.push(`/projects/${project.id}`)}
              >
                <span className="font-bold">{project.title}</span>
                <span className="text-ink-dim">
                  {project.mode} · {project.status} ·{" "}
                  {new Date(project.updatedAt).toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </main>
  );
}
