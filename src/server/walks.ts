import { z } from "zod";
import { createRng } from "@/domain/walk/prng";
import { runRandomWalk } from "@/domain/walk/random-walk";
import { runBurkeWalk } from "@/domain/burke/engine";
import type {
  BurkeNote,
  BurkeOracle,
  ElasticityCheckpoint,
  SalienceWeight,
} from "@/domain/burke/types";
import { createBurkeOracle } from "@/server/burke-oracle-factory";
import {
  runCriteriologicalWalk,
  type EnrichedVisitedNode,
} from "@/domain/walk/criteriological-walk";
import { scorePath, type PathScore } from "@/domain/walk/features";
import type { CandidateRecord, WalkEndReason } from "@/domain/walk/types";
import { walkConfigurationSchema } from "@/schemas/walk-configuration";
import { prisma } from "@/server/db";
import {
  createGatewayBundle,
  type GatewayBundle,
} from "@/server/walk-gateway-factory";
import type { PrismaClient } from "@/generated/prisma/client";

// Walk orchestration for both modes. RANDOM produces one path and persists
// it directly. CRITERIOLOGICAL produces three seeded candidate paths for
// the user to compare; choosing one materializes it into SourceNodes.
// Everything expensive is persisted before the next stage begins.

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
  entityTypes: string[];
  dateStart: number | null;
  dateEnd: number | null;
  rawWalkScore: number | null;
  outgoingLinks: CandidateRecord[];
  visitIndex: number;
}

export interface CandidateWalkDto {
  id: string;
  label: string;
  endReason: string;
  pathScore: PathScore;
  titles: string[];
  chosen: boolean;
}

export interface BurkeRunDto {
  id: string;
  salience: SalienceWeight[];
  notes: BurkeNote[];
  checkpoints: ElasticityCheckpoint[];
  finalRedescription: string;
  endReason: string;
  createdAt: string;
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

/** Everything needed to materialize a node without refetching. */
interface PersistedWalkNode {
  title: string;
  url: string;
  summary: string;
  pageId: number;
  wikidataId?: string;
  categories: string[];
  visitIndex: number;
  score?: number;
  features?: import("@/domain/walk/features").CandidateFeatures;
  why?: string[];
  chosenFrom: CandidateRecord[];
  entityTypes: string[];
  eraStart?: number;
  eraEnd?: number;
  coord?: { lat: number; lon: number };
}

function toPersistedNode(node: EnrichedVisitedNode): PersistedWalkNode {
  return {
    title: node.info.title,
    url: node.info.url,
    summary: node.info.summary,
    pageId: node.info.pageId,
    wikidataId: node.info.wikidataId,
    categories: node.categories,
    visitIndex: node.visitIndex,
    score: node.score,
    features: node.features,
    why: node.why,
    chosenFrom: node.chosenFrom,
    entityTypes: node.facts?.instanceOfLabels ?? [],
    eraStart: node.facts?.eraStart,
    eraEnd: node.facts?.eraEnd,
    coord: node.facts?.coord,
  };
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
  const [nodes, candidates, latestJob, burkeRun] = await Promise.all([
    db.sourceNode.findMany({
      where: { projectId },
      orderBy: { visitIndex: "asc" },
    }),
    db.candidateWalk.findMany({
      where: { projectId },
      orderBy: { label: "asc" },
    }),
    db.generationJob.findFirst({
      where: { projectId, type: "WALK" },
      orderBy: { createdAt: "desc" },
    }),
    db.burkeRun.findFirst({
      where: { projectId },
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
    entityTypes: JSON.parse(n.entityTypes) as string[],
    dateStart: n.dateStart ?? null,
    dateEnd: n.dateEnd ?? null,
    rawWalkScore: n.rawWalkScore ?? null,
    outgoingLinks: JSON.parse(n.outgoingLinks) as CandidateRecord[],
    visitIndex: n.visitIndex,
  }));

  const candidateWalks: CandidateWalkDto[] = candidates.map((c) => {
    const persisted = JSON.parse(c.nodes) as PersistedWalkNode[];
    return {
      id: c.id,
      label: c.label,
      endReason: c.endReason,
      pathScore: JSON.parse(c.pathScore) as PathScore,
      titles: persisted.map((n) => n.title),
      chosen: c.chosen,
    };
  });

  const burke: BurkeRunDto | null = burkeRun
    ? {
        id: burkeRun.id,
        salience: JSON.parse(burkeRun.salience) as SalienceWeight[],
        notes: JSON.parse(burkeRun.notes) as BurkeNote[],
        checkpoints: JSON.parse(burkeRun.checkpoints) as ElasticityCheckpoint[],
        finalRedescription: burkeRun.finalRedescription,
        endReason: burkeRun.endReason,
        createdAt: burkeRun.createdAt.toISOString(),
      }
    : null;

  return {
    sourceNodes,
    candidateWalks,
    burkeRun: burke,
    latestJob: latestJob ? jobToDto(latestJob) : null,
  };
}

export async function startWalk(
  projectId: string,
  input: StartWalkInput,
  db: PrismaClient = prisma,
  gatewayFactory: (language: string, budget: number) => GatewayBundle = createGatewayBundle,
  oracleFactory: () => BurkeOracle = createBurkeOracle,
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

  // Same-seed regeneration reuses the previously resolved start title (from
  // materialized nodes, or from stored candidate walks if none was chosen).
  let pinnedStartTitle: string | null = null;
  if (parsed.mode === "same-seed") {
    const first = await db.sourceNode.findFirst({
      where: { projectId, visitIndex: 0 },
    });
    if (first) {
      pinnedStartTitle = first.title;
    } else {
      const candidate = await db.candidateWalk.findFirst({
        where: { projectId },
        orderBy: { label: "asc" },
      });
      if (candidate) {
        const nodes = JSON.parse(candidate.nodes) as PersistedWalkNode[];
        pinnedStartTitle = nodes[0]?.title ?? null;
      }
    }
    if (!pinnedStartTitle) {
      return {
        ok: false,
        status: 409,
        error: "No previous walk to regenerate; generate a walk first",
      };
    }
  }

  const job = await db.generationJob.create({
    data: { projectId, type: "WALK", status: "QUEUED", currentStep: "Queued" },
  });

  void executeWalkJob({
    db,
    gatewayFactory,
    oracleFactory,
    projectId,
    jobId: job.id,
    configuration,
    pinnedStartTitle,
  }).catch(async (error) => {
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

/** Materialize one candidate walk into SourceNodes (the "chosen" path). */
export async function chooseCandidateWalk(
  projectId: string,
  candidateWalkId: string,
  db: PrismaClient = prisma,
): Promise<
  | { ok: true }
  | { ok: false; status: number; error: string }
> {
  const candidate = await db.candidateWalk.findUnique({
    where: { id: candidateWalkId },
  });
  if (!candidate || candidate.projectId !== projectId) {
    return { ok: false, status: 404, error: "Candidate walk not found" };
  }
  const nodes = JSON.parse(candidate.nodes) as PersistedWalkNode[];
  if (nodes.length === 0) {
    return { ok: false, status: 409, error: "Candidate walk has no nodes" };
  }

  await db.$transaction(async (tx) => {
    await tx.sourceNode.deleteMany({ where: { projectId } });
    for (const node of nodes) {
      const created = await tx.sourceNode.create({
        data: {
          projectId,
          wikipediaPageId: node.pageId,
          wikidataId: node.wikidataId,
          title: node.title,
          url: node.url,
          summary: node.summary,
          categories: JSON.stringify(node.categories),
          entityTypes: JSON.stringify(node.entityTypes),
          dateStart: node.eraStart,
          dateEnd: node.eraEnd,
          locations: JSON.stringify(
            node.coord ? [`${node.coord.lat},${node.coord.lon}`] : [],
          ),
          rawWalkScore: node.score,
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
    await tx.candidateWalk.updateMany({
      where: { projectId },
      data: { chosen: false },
    });
    await tx.candidateWalk.update({
      where: { id: candidateWalkId },
      data: { chosen: true },
    });
    await tx.walkProject.update({
      where: { id: projectId },
      data: { status: "WALK_READY" },
    });
  });

  return { ok: true };
}

async function executeWalkJob(options: {
  db: PrismaClient;
  gatewayFactory: (language: string, budget: number) => GatewayBundle;
  oracleFactory: () => BurkeOracle;
  projectId: string;
  jobId: string;
  configuration: ReturnType<typeof walkConfigurationSchema.parse>;
  pinnedStartTitle: string | null;
}): Promise<void> {
  const {
    db,
    gatewayFactory,
    oracleFactory,
    projectId,
    jobId,
    configuration,
    pinnedStartTitle,
  } = options;

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

    if (configuration.walkMode === "RANDOM") {
      await executeRandomWalk();
    } else if (configuration.walkMode === "CRITERIOLOGICAL") {
      await executeCriteriologicalWalk();
    } else {
      await executeBurkeWalk();
    }
  } catch (error) {
    await failJob(error instanceof Error ? error.message : String(error));
  }

  async function resolveStart(bundle: GatewayBundle): Promise<string> {
    if (pinnedStartTitle) return pinnedStartTitle;
    return (await bundle.wikipedia.resolveStart(configuration.start)).title;
  }

  function engineConfig() {
    return {
      walkLength: configuration.walkLength,
      branchFactor: configuration.branchFactor,
      allowRevisits: configuration.allowRevisits,
      excludeMetaPages: configuration.excludeMetaPages,
      minArticleLength: configuration.minArticleLength,
    };
  }

  async function executeRandomWalk(): Promise<void> {
    const bundle = gatewayFactory(
      configuration.language,
      configuration.maxGraphRequests,
    );
    const startTitle = await resolveStart(bundle);
    const result = await runRandomWalk({
      gateway: bundle.wikipedia,
      rng: createRng(configuration.seed),
      config: engineConfig(),
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

    await db.$transaction(async (tx) => {
      await tx.sourceNode.deleteMany({ where: { projectId } });
      await tx.candidateWalk.deleteMany({ where: { projectId } });
      await tx.burkeRun.deleteMany({ where: { projectId } });
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
  }

  async function executeBurkeWalk(): Promise<void> {
    if (configuration.burke.seedText.trim().length === 0) {
      throw new Error(
        "Burke walks need a seed — a lay-intelligible object or question",
      );
    }
    const bundle = gatewayFactory(
      configuration.language,
      configuration.maxGraphRequests,
    );
    const oracle = oracleFactory();

    // Entry article: the configured start, except RANDOM, which for a Burke
    // walk means "search from the seed text itself".
    const startTitle =
      pinnedStartTitle ??
      (
        await bundle.wikipedia.resolveStart(
          configuration.start.kind === "RANDOM" ||
            configuration.start.value.trim().length === 0
            ? { kind: "TOPIC", value: configuration.burke.seedText }
            : configuration.start,
        )
      ).title;

    const result = await runBurkeWalk({
      wikipedia: bundle.wikipedia,
      oracle,
      rng: createRng(configuration.seed),
      config: {
        seed: {
          kind: configuration.burke.seedKind,
          text: configuration.burke.seedText,
        },
        priming: configuration.burke.priming,
        motif: configuration.burke.motif,
        elasticityInterval: configuration.burke.elasticityInterval,
        maxPages: configuration.burke.maxPages,
        branchFactor: configuration.branchFactor,
        excludeMetaPages: configuration.excludeMetaPages,
        allowRevisits: configuration.allowRevisits,
      },
      startTitle,
      onProgress: async (p) => {
        await db.generationJob.update({
          where: { id: jobId },
          data: {
            progress: p.visitedCount / p.targetLength,
            currentStep: `${p.stage} — ${p.visitedCount}/${p.targetLength} pages: ${p.currentTitle} (${p.requestsUsed} requests)`,
          },
        });
      },
    });

    if (result.visited.length === 0) {
      await failJob("Burke walk visited no articles (start could not be visited)");
      return;
    }

    await db.$transaction(async (tx) => {
      await tx.sourceNode.deleteMany({ where: { projectId } });
      await tx.candidateWalk.deleteMany({ where: { projectId } });
      await tx.burkeRun.deleteMany({ where: { projectId } });
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
            outgoingLinks: JSON.stringify(
              node.judgments.map((j) => ({
                title: j.title,
                eligible: !j.discarded,
                exclusionReason: j.discarded
                  ? `discarded: ${j.rationale}`
                  : undefined,
                score: j.returnPotential,
                why: [j.rationale],
              })),
            ),
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
      await tx.burkeRun.create({
        data: {
          projectId,
          salience: JSON.stringify(result.salience),
          notes: JSON.stringify(result.notes),
          checkpoints: JSON.stringify(result.checkpoints),
          finalRedescription: result.finalRedescription,
          endReason: result.endReason,
        },
      });
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
        currentStep: `Burke walk complete: ${result.visited.length} pages, ${result.notes.length} notes, ${result.requestsUsed} requests — ${result.endReason.replaceAll("_", " ").toLowerCase()}`,
      },
    });
  }

  async function executeCriteriologicalWalk(): Promise<void> {
    const labels = ["A", "B", "C"] as const;
    const results: Array<{
      label: string;
      seedUsed: string;
      nodes: PersistedWalkNode[];
      pathScore: PathScore;
      endReason: WalkEndReason;
    }> = [];

    // One shared budget across all three candidates: maxGraphRequests bounds
    // the whole generation, not each path separately. Shared caching makes
    // later candidates far cheaper than the first.
    const bundle = gatewayFactory(
      configuration.language,
      configuration.maxGraphRequests,
    );
    const startTitle = await resolveStart(bundle);

    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      const seedUsed = `${configuration.seed}::${label}`;
      const result = await runCriteriologicalWalk({
        wikipedia: bundle.wikipedia,
        entityFacts: bundle.entityFacts,
        rng: createRng(seedUsed),
        config: {
          ...engineConfig(),
          criteriaWeights: configuration.criteriaWeights,
          pathDescription: configuration.pathDescription,
          samplingMode: configuration.samplingMode,
          temporalBounds: configuration.temporalBounds,
          maxPopularityPercentile: configuration.maxPopularityPercentile,
        },
        startTitle,
        onProgress: async (p) => {
          await db.generationJob.update({
            where: { id: jobId },
            data: {
              progress: (i + p.visitedCount / p.targetLength) / labels.length,
              currentStep: `Candidate ${label}: visited ${p.visitedCount}/${p.targetLength}: ${p.currentTitle} (${p.requestsUsed} requests)`,
            },
          });
        },
      });

      if (result.visited.length === 0) {
        throw new Error(
          `Candidate ${label} visited no articles (start could not be visited)`,
        );
      }

      results.push({
        label,
        seedUsed,
        nodes: result.visited.map(toPersistedNode),
        pathScore: scorePath(
          result.visited.map((n) => ({ features: n.features, facts: n.facts })),
        ),
        endReason: result.endReason,
      });

      // Budget exhausted mid-generation: keep what we have rather than
      // discarding finished candidates.
      if (result.endReason === "REQUEST_BUDGET_EXHAUSTED") break;
    }

    await db.$transaction(async (tx) => {
      await tx.candidateWalk.deleteMany({ where: { projectId } });
      await tx.sourceNode.deleteMany({ where: { projectId } });
      await tx.burkeRun.deleteMany({ where: { projectId } });
      for (const r of results) {
        await tx.candidateWalk.create({
          data: {
            projectId,
            label: r.label,
            seedUsed: r.seedUsed,
            endReason: r.endReason,
            pathScore: JSON.stringify(r.pathScore),
            nodes: JSON.stringify(r.nodes),
          },
        });
      }
      await tx.walkProject.update({
        where: { id: projectId },
        data: { status: "WALK_READY", startNodeId: null },
      });
    });

    await db.generationJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETE",
        progress: 1,
        currentStep: `Generated ${results.length} candidate path${results.length === 1 ? "" : "s"} (${bundle.budget.used} requests). Choose one to continue.`,
      },
    });
  }
}
