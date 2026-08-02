import { z } from "zod";
import { PROJECT_STATUSES, type WalkProjectStatus } from "@/domain/enums";
import {
  walkConfigurationSchema,
  defaultWalkConfiguration,
  type WalkConfiguration,
} from "@/schemas/walk-configuration";
import { prisma } from "@/server/db";
import type { PrismaClient } from "@/generated/prisma/client";

export interface WalkProjectDto {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  mode: WalkConfiguration["walkMode"];
  seed: string;
  startNodeId: string | null;
  endpointNodeId: string | null;
  configuration: WalkConfiguration;
  status: WalkProjectStatus;
}

export const createProjectInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  configuration: walkConfigurationSchema.optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const updateProjectInputSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  configuration: walkConfigurationSchema.optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

type ProjectRow = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  mode: string;
  seed: string;
  startNodeId: string | null;
  endpointNodeId: string | null;
  configuration: string;
  status: string;
};

function toDto(row: ProjectRow): WalkProjectDto {
  // Stored JSON is re-validated on the way out so schema drift fails loudly
  // instead of leaking malformed configuration into the UI.
  const configuration = walkConfigurationSchema.parse(
    JSON.parse(row.configuration),
  );
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    mode: configuration.walkMode,
    seed: row.seed,
    startNodeId: row.startNodeId,
    endpointNodeId: row.endpointNodeId,
    configuration,
    status: row.status as WalkProjectStatus,
  };
}

export async function createProject(
  input: CreateProjectInput,
  db: PrismaClient = prisma,
): Promise<WalkProjectDto> {
  const parsed = createProjectInputSchema.parse(input);
  const configuration = parsed.configuration ?? defaultWalkConfiguration();
  const row = await db.walkProject.create({
    data: {
      title: parsed.title,
      mode: configuration.walkMode,
      seed: configuration.seed,
      configuration: JSON.stringify(configuration),
      status: "DRAFT",
    },
  });
  return toDto(row);
}

export async function getProject(
  id: string,
  db: PrismaClient = prisma,
): Promise<WalkProjectDto | null> {
  const row = await db.walkProject.findUnique({ where: { id } });
  return row ? toDto(row) : null;
}

export async function listProjects(
  db: PrismaClient = prisma,
): Promise<WalkProjectDto[]> {
  const rows = await db.walkProject.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toDto);
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
  db: PrismaClient = prisma,
): Promise<WalkProjectDto | null> {
  const parsed = updateProjectInputSchema.parse(input);
  const existing = await db.walkProject.findUnique({ where: { id } });
  if (!existing) return null;

  const row = await db.walkProject.update({
    where: { id },
    data: {
      ...(parsed.title !== undefined && { title: parsed.title }),
      ...(parsed.status !== undefined && { status: parsed.status }),
      ...(parsed.configuration !== undefined && {
        configuration: JSON.stringify(parsed.configuration),
        mode: parsed.configuration.walkMode,
        seed: parsed.configuration.seed,
      }),
    },
  });
  return toDto(row);
}
