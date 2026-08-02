import { z } from "zod";
import { createRng } from "@/domain/walk/prng";
import { runRandomWalk } from "@/domain/walk/random-walk";
import type { CandidateRecord, WalkEndReason } from "@/domain/walk/types";
import { walkConfigurationSchema } from "@/schemas/walk-configuration";
import { prisma } from "@/server/db";
import { createWalkGateway, type FullGateway } from "@/server/walk-gateway-factory";
import type { PrismaClient } from "@/generated/prisma/client";

// Walk orchestration: resolve start → run engine → persist SourceNodes.
// The walk is persisted atomically after the engine finishes; a failed walk
// never destroys the previous one. Regeneration is always an explicit user
// action (never a side effect), so replacing prior source nodes here honors
// the "persist expensive material" rule.

export const startWalkInputSchema = z.object({
  mode: z.enum(["fresh", "same-seed"]).default("fresh"),
});
export type StartWalkInput = z.infer<typeof startWalkInputSchema>;

export interface SourceNodeDto {
  id: string;
  title: string;
  url: string;
  summary: string;
  wikipediaPageId: number;
  wikidataId: string | null;
  categories: string[];
  outgoingLinks: CandidateRecord[];
  visitIndex: number;
}

export interface GenerationJobDto {
  id: string;
  type: string;
  status: "QUEUED" | "RUNNING" | "COMPLETE" | "FAILED";
  progress: number;
  currentStep: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

const END_REASON_LABEL: Record<WalkEndReason, string> = {
  TARGET_LENGTH_REACHED: "target length reached",
  NO_ELIGIBLE_CANDIDATES: "no eligible candidates remained",
  REQUEST_BUDGET_EXHAUSTED: "graph request budget exhausted",
};

function jobToDto(row: {
  id: string;
  type: string;
  status: string;
  progress: number;
  currentStep: string;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}): GenerationJobDto {
  return {
    id: row.id,
    type: row.type,
    status: row.status as GenerationJobDto["status"],
    progress: row.progress,
    currentStep: row.currentStep,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getWalk(projectId: string, db: PrismaClient = prisma) {
  const [nodes, latestJob] = await Promise.all([
    db.sourceNode.findMany({
      where: { projectId },
      orderBy: { visitIndex: "asc" },
    }),
    db.generationJob.findFirst({
      where: { projectId, type: "WALK" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const sourceNodes: SourceNodeDto[] = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    url: n.url,
    summary: n.summary,
    wikipediaPageId: n.wikipediaPageId,
    wikidataId: n.wikidataId ?? null,
    categories: JSON.parse(n.categories) as string[],
    outgoingLinks: JSON.parse(n.outgoingLinks) as CandidateRecord[],
    visitIndex: n.visitIndex,
  }));

  return {
    sourceNodes,
    latestJob: latestJob ? jobToDto(latestJob) : null,
  };
}

/**
 * Create the job row and kick off the walk. Returns the queued job; the walk
 * itself runs in the background and reports through the job row.
 */
export async function startWalk(
  projectId: string,
  input: StartWalkInput,
  db: PrismaClient = prisma,
  gatewayFactory: (language: string, budget: number) => FullGateway = createWalkGateway,
): Promise<
  | { ok: true; job: GenerationJobDto }
  | { ok: false; status: number; error: string }
> {
  const parsed = startWalkInputSchema.parse(input);

  const project = await db.walkProject.findUnique({ where: { id: projectId } });
  if (!project) return { ok: false, status: 404, error: "Project not found" };

  const running = await db.generationJob.findFirst({
    where: { projectId, status: { in: ["QUEUED", "RUNNING"] } },
  });
  if (running) {
    return {
      ok: false,
      status: 409,
      error: "A generation job is already running for this project",
    };
  }

  const configuration = walkConfigurationSchema.parse(
    JSON.parse(project.configuration),
  );

  // "Regenerate with same seed" must reproduce the path even when the start
  // was RANDOM: reuse the previously resolved start title.
  let pinnedStartTitle: string | null = null;
  if (parsed.mode === "same-seed") {
    const first = await db.sourceNode.findFirst({
      where: { projectId, visitIndex: 0 },
    });
    if (!first) {
      return {
        ok: false,
        status: 409,
        error: "No previous walk to regenerate; generate a walk first",
      };
    }
    pinnedStartTitle = first.title;
  }

  const job = await db.generationJob.create({
    data: {
      projectId,
      type: "WALK",
      status: "QUEUED",
      currentStep: "Queued",
    },
  });

  void executeWalkJob({
    db,
    gatewayFactory,
    projectId,
    jobId: job.id,
    configuration,
    pinnedStartTitle,
  }).catch(async (error) => {
    // Last-resort guard: executeWalkJob handles its own failures, so this
    // only fires if even the failure bookkeeping threw.
    console.error("Walk job crashed outside its own error handling:", error);
    await db.generationJob
      .update({
        where: { id: job.id },
        data: { status: "FAILED", error: String(error) },
      })
      .catch(() => undefined);
  });

  return { ok: true, job: jobToDto(job) };
}

async function executeWalkJob(options: {
  db: PrismaClient;
  gatewayFactory: (language: string, budget: number) => FullGateway;
  projectId: string;
  jobId: string;
  configuration: ReturnType<typeof walkConfigurationSchema.parse>;
  pinnedStartTitle: string | null;
}): Promise<void> {
  const { db, gatewayFactory, projectId, jobId, configuration, pinnedStartTitle } =
    options;

  const failJob = async (message: string) => {
    await db.generationJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: message, currentStep: "Failed" },
    });
    await db.walkProject.update({
      where: { id: projectId },
      data: { status: "FAILED" },
    });
  };

  try {
    await db.generationJob.update({
      where: { id: jobId },
      data: { status: "RUNNING", currentStep: "Resolving start article" },
    });
    await db.walkProject.update({
      where: { id: projectId },
      data: { status: "WALKING" },
    });

    const gateway = gatewayFactory(
      configuration.language,
      configuration.maxGraphRequests,
    );

    const startTitle =
      pinnedStartTitle ??
      (await gateway.resolveStart(configuration.start)).title;

    const rng = createRng(configuration.seed);

    const result = await runRandomWalk({
      gateway,
      rng,
      config: {
        walkLength: configuration.walkLength,
        branchFactor: configuration.branchFactor,
        allowRevisits: configuration.allowRevisits,
        excludeMetaPages: configuration.excludeMetaPages,
        minArticleLength: configuration.minArticleLength,
      },
      startTitle,
      onProgress: async (p) => {
        await db.generationJob.update({
          where: { id: jobId },
          data: {
            progress: p.visitedCount / p.targetLength,
            currentStep: `Visited ${p.visitedCount}/${p.targetLength}: ${p.currentTitle} (${p.requestsUsed} requests)`,
          },
        });
      },
    });

    if (result.visited.length === 0) {
      await failJob("Walk visited no articles (start could not be visited)");
      return;
    }

    // Atomically replace the previous walk with the new one.
    await db.$transaction(async (tx) => {
      await tx.sourceNode.deleteMany({ where: { projectId } });
      for (const node of result.visited) {
        const created = await tx.sourceNode.create({
          data: {
            projectId,
            wikipediaPageId: node.info.pageId,
            wikidataId: node.info.wikidataId,
            title: node.info.title,
            url: node.info.url,
            summary: node.info.summary,
            categories: JSON.stringify(node.categories),
            outgoingLinks: JSON.stringify(node.chosenFrom),
            visitIndex: node.visitIndex,
          },
        });
        if (node.visitIndex === 0) {
          await tx.walkProject.update({
            where: { id: projectId },
            data: { startNodeId: created.id },
          });
        }
      }
      await tx.walkProject.update({
        where: { id: projectId },
        data: { status: "WALK_READY" },
      });
    });

    await db.generationJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETE",
        progress: 1,
        currentStep: `Walk complete: ${result.visited.length} nodes, ${result.requestsUsed} requests, ${END_REASON_LABEL[result.endReason]}`,
      },
    });
  } catch (error) {
    await failJob(error instanceof Error ? error.message : String(error));
  }
}
