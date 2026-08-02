import type { WalkProjectDto, UpdateProjectInput } from "@/server/projects";
import type {
  AnamnesisRunDto,
  BurkeRunDto,
  CandidateWalkDto,
  GenerationJobDto,
  SourceNodeDto,
  StartWalkInput,
} from "@/server/walks";
import type { WalkConfiguration } from "@/schemas/walk-configuration";

export interface WalkDto {
  sourceNodes: SourceNodeDto[];
  candidateWalks: CandidateWalkDto[];
  burkeRun: BurkeRunDto | null;
  anamnesisRun: AnamnesisRunDto | null;
  latestJob: GenerationJobDto | null;
}

// Thin typed fetch layer used by TanStack Query hooks. Server errors are
// surfaced verbatim; nothing is silently defaulted.

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: string;
      issues?: Array<{ path?: unknown[]; message?: string }>;
    };
    if (body.issues?.length) {
      const details = body.issues
        .map((i) => `${(i.path ?? []).join(".")}: ${i.message}`)
        .join("; ");
      return `${body.error ?? "Request failed"} (${details})`;
    }
    return body.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export async function fetchProjects(): Promise<WalkProjectDto[]> {
  const response = await fetch("/api/projects");
  if (!response.ok) throw new Error(await parseError(response));
  const body = (await response.json()) as { projects: WalkProjectDto[] };
  return body.projects;
}

export async function fetchProject(id: string): Promise<WalkProjectDto> {
  const response = await fetch(`/api/projects/${id}`);
  if (!response.ok) throw new Error(await parseError(response));
  const body = (await response.json()) as { project: WalkProjectDto };
  return body.project;
}

export async function createProjectRequest(input: {
  title: string;
  configuration?: WalkConfiguration;
}): Promise<WalkProjectDto> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseError(response));
  const body = (await response.json()) as { project: WalkProjectDto };
  return body.project;
}

export async function fetchWalk(projectId: string): Promise<WalkDto> {
  const response = await fetch(`/api/projects/${projectId}/walk`);
  if (!response.ok) throw new Error(await parseError(response));
  return (await response.json()) as WalkDto;
}

export async function startWalkRequest(
  projectId: string,
  input: StartWalkInput,
): Promise<GenerationJobDto> {
  const response = await fetch(`/api/projects/${projectId}/walk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseError(response));
  const body = (await response.json()) as { job: GenerationJobDto };
  return body.job;
}

export async function chooseCandidateWalkRequest(
  projectId: string,
  candidateWalkId: string,
): Promise<void> {
  const response = await fetch(`/api/projects/${projectId}/walk/choose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidateWalkId }),
  });
  if (!response.ok) throw new Error(await parseError(response));
}

export async function updateProjectRequest(
  id: string,
  input: UpdateProjectInput,
): Promise<WalkProjectDto> {
  const response = await fetch(`/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseError(response));
  const body = (await response.json()) as { project: WalkProjectDto };
  return body.project;
}
