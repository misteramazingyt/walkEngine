import { z } from "zod";
import { createRng } from "@/domain/walk/prng";
import { runRandomWalk } from "@/domain/walk/random-walk";
import { runBurkeWalk } from "@/domain/burke/engine";
import type {
  BurkeNarrative,
  BurkeNote,
  BurkeOracle,
  CoherenceReport,
  StoryState,
  TheoryCheckpoint,
} from "@/domain/burke/types";
import { runAnamnesisWalk } from "@/domain/anamnesis/engine";
import type {
  AnamnesisComposition,
  AnamnesisState,
  Mediation,
  RecollectionTest,
} from "@/domain/anamnesis/types";
import type { AnamnesisOracle } from "@/domain/anamnesis/types";
import { RUN_SCHEMA_VERSION } from "@/domain/walk/strategy";
import {
  createAnamnesisOracle,
  createBurkeOracle,
  createStartOracle,
} from "@/server/oracle-factory";
import { runBurkeClusterWalk } from "@/domain/burkecluster/engine";
import type {
  BurkeClusterNarrative,
  BurkeClusterOracle,
  BurkeClusterResult,
  BurkeClusterState,
} from "@/domain/burkecluster/types";
import type { ArchiveEdge, ArchiveNode } from "@/domain/graph/types";
import { createBurkeClusterOracle } from "@/server/burkecluster-oracle-factory";
import {
  runCriteriologicalWalk,
  type EnrichedVisitedNode,
} from "@/domain/walk/criteriological-walk";
import { scorePath, type PathScore } from "@/domain/walk/features";
import type {
  CandidateRecord,
  StartOracle,
  WalkEndReason,
} from "@/domain/walk/types";
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
  storyState: StoryState;
  notes: BurkeNote[];
  checkpoints: TheoryCheckpoint[];
  coherenceReports: CoherenceReport[];
  narrative: BurkeNarrative | null;
  rejectedRoutes: Array<{ title: string; reason: string }>;
  backtrackCount: number;
  endReason: string;
  createdAt: string;
}

export interface AnamnesisRunDto {
  id: string;
  state: AnamnesisState;
  mediations: Mediation[];
  recollectionTests: RecollectionTest[];
  composition: AnamnesisComposition | null;
  abandonedRoutes: Array<{ title: string; reason: string }>;
  endReason: string;
  createdAt: string;
}

export interface BurkeClusterRunDto {
  id: string;
  randomSeed: string;
  state: BurkeClusterState;
  narrative: BurkeClusterNarrative | null;
  transitionTable: BurkeClusterResult["transitionTable"];
  graphNodes: ArchiveNode[];
  graphEdges: ArchiveEdge[];
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
  const [nodes, candidates, latestJob, burkeRun, anamnesisRun, clusterRun] =
    await Promise.all([
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
    db.anamnesisRun.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    }),
    db.burkeClusterRun.findFirst({
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
        storyState: JSON.parse(burkeRun.storyState) as StoryState,
        notes: JSON.parse(burkeRun.notes) as BurkeNote[],
        checkpoints: JSON.parse(burkeRun.checkpoints) as TheoryCheckpoint[],
        coherenceReports: JSON.parse(
          burkeRun.coherenceReports,
        ) as CoherenceReport[],
        narrative: burkeRun.narrative
          ? (JSON.parse(burkeRun.narrative) as BurkeNarrative)
          : null,
        rejectedRoutes: JSON.parse(burkeRun.rejectedRoutes) as Array<{
          title: string;
          reason: string;
        }>,
        backtrackCount: burkeRun.backtrackCount,
        endReason: burkeRun.endReason,
        createdAt: burkeRun.createdAt.toISOString(),
      }
    : null;

  const anamnesis: AnamnesisRunDto | null = anamnesisRun
    ? {
        id: anamnesisRun.id,
        state: JSON.parse(anamnesisRun.state) as AnamnesisState,
        mediations: JSON.parse(anamnesisRun.mediations) as Mediation[],
        recollectionTests: JSON.parse(
          anamnesisRun.recollectionTests,
        ) as RecollectionTest[],
        composition: anamnesisRun.composition
          ? (JSON.parse(anamnesisRun.composition) as AnamnesisComposition)
          : null,
        abandonedRoutes: JSON.parse(anamnesisRun.abandonedRoutes) as Array<{
          title: string;
          reason: string;
        }>,
        endReason: anamnesisRun.endReason,
        createdAt: anamnesisRun.createdAt.toISOString(),
      }
    : null;

  const cluster: BurkeClusterRunDto | null = clusterRun
    ? {
        id: clusterRun.id,
        randomSeed: clusterRun.randomSeed,
        state: JSON.parse(clusterRun.state) as BurkeClusterState,
        narrative: clusterRun.narrative
          ? (JSON.parse(clusterRun.narrative) as BurkeClusterNarrative)
          : null,
        transitionTable: JSON.parse(
          clusterRun.transitionTable,
        ) as BurkeClusterResult["transitionTable"],
        graphNodes: JSON.parse(clusterRun.graphNodes) as ArchiveNode[],
        graphEdges: JSON.parse(clusterRun.graphEdges) as ArchiveEdge[],
        endReason: clusterRun.endReason,
        createdAt: clusterRun.createdAt.toISOString(),
      }
    : null;

  return {
    sourceNodes,
    candidateWalks,
    burkeRun: burke,
    anamnesisRun: anamnesis,
    clusterRun: cluster,
    latestJob: latestJob ? jobToDto(latestJob) : null,
  };
}

export async function startWalk(
  projectId: string,
  input: StartWalkInput,
  db: PrismaClient = prisma,
  gatewayFactory: (language: string, budget: number) => GatewayBundle = createGatewayBundle,
  oracleFactory: () => BurkeOracle = createBurkeOracle,
  anamnesisOracleFactory: () => AnamnesisOracle = createAnamnesisOracle,
  clusterOracleFactory: () => BurkeClusterOracle = createBurkeClusterOracle,
  startOracleFactory: () => StartOracle = createStartOracle,
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
    anamnesisOracleFactory,
    clusterOracleFactory,
    startOracleFactory,
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
  anamnesisOracleFactory: () => AnamnesisOracle;
  clusterOracleFactory: () => BurkeClusterOracle;
  startOracleFactory: () => StartOracle;
  projectId: string;
  jobId: string;
  configuration: ReturnType<typeof walkConfigurationSchema.parse>;
  pinnedStartTitle: string | null;
}): Promise<void> {
  const {
    db,
    gatewayFactory,
    oracleFactory,
    anamnesisOracleFactory,
    clusterOracleFactory,
    startOracleFactory,
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

    // Strategy dispatch. Each branch owns its engine call and its own
    // persistence transaction; everything before this point (gateways,
    // budget, job bookkeeping, start resolution) is shared.
    switch (configuration.walkMode) {
      case "RANDOM":
        await executeRandomWalk();
        break;
      case "CRITERIOLOGICAL":
        await executeCriteriologicalWalk();
        break;
      case "BURKE":
        await executeBurkeWalk();
        break;
      case "ANAMNETIC":
        await executeAnamnesisWalk();
        break;
      case "BURKECLUSTER":
        await executeBurkeClusterWalk();
        break;
    }
  } catch (error) {
    await failJob(error instanceof Error ? error.message : String(error));
  }

  /**
   * The seed material the current mode carries. This is what an
   * LLM-determined start reasons from, so each mode contributes the text
   * that actually states what the walk is for — not its numeric parameters.
   */
  function modeSeedInfo(): string {
    const parts: string[] = [];
    switch (configuration.walkMode) {
      case "BURKE":
        parts.push(configuration.burke.seedText, configuration.burke.priming);
        break;
      case "ANAMNETIC":
        parts.push(
          configuration.anamnesis.terminalSentence,
          configuration.anamnesis.intent,
        );
        break;
      case "BURKECLUSTER":
        parts.push(
          configuration.burkeCluster.seedText,
          configuration.burkeCluster.attentionProgram,
        );
        break;
      default:
        parts.push(configuration.pathDescription);
    }
    return parts.map((p) => p.trim()).filter((p) => p.length > 0).join("\n");
  }

  /**
   * An LLM-determined start. Candidates come from search, so the oracle
   * chooses among pages that demonstrably exist, and a title it names that
   * is not on the list is refused rather than trusted — the walk fails
   * instead of beginning at a page nobody verified.
   */
  async function chooseStartWithOracle(bundle: GatewayBundle): Promise<string> {
    const seedInfo = modeSeedInfo();
    const guidance = configuration.start.value.trim();
    if (seedInfo.length === 0 && guidance.length === 0) {
      throw new Error(
        "An LLM-determined start needs something to go on — give this mode its seed text, or describe what to look for in Start value",
      );
    }
    if (!bundle.wikipedia.searchTitles) {
      throw new Error(
        "An LLM-determined start needs full-text search, which this gateway does not provide",
      );
    }

    const titles = new Set<string>();
    for (const phrase of [guidance, seedInfo].filter((p) => p.length > 0)) {
      for (const title of await bundle.wikipedia.searchTitles(phrase, 8)) {
        titles.add(title);
      }
    }
    const infos = await bundle.wikipedia.getArticleInfos([...titles].slice(0, 20));
    const candidates: Array<{ title: string; summary: string }> = [];
    for (const [, info] of infos) {
      if (info.missing || info.isDisambiguation || info.summary.length === 0) {
        continue;
      }
      candidates.push({ title: info.title, summary: info.summary.slice(0, 400) });
    }
    if (candidates.length === 0) {
      throw new Error(
        `No Wikipedia pages could be found to start from for "${(guidance || seedInfo).slice(0, 80)}"`,
      );
    }

    const selection = await startOracleFactory().chooseStart({
      seedInfo,
      guidance,
      candidates,
    });
    if (!candidates.some((c) => c.title === selection.title)) {
      throw new Error(
        `The model chose "${selection.title}" to start from, which was not one of the candidate pages`,
      );
    }
    await db.generationJob.update({
      where: { id: jobId },
      data: { currentStep: `Start chosen: ${selection.title} — ${selection.reason}` },
    });
    return selection.title;
  }

  /**
   * The entry article for modes that walk from one. `fallbackTopic` is the
   * mode's own seed text, searched when no start was specified — a Burke or
   * anamnetic walk with an unset start begins from what it is about, not
   * from a random article.
   */
  async function resolveStart(
    bundle: GatewayBundle,
    fallbackTopic = "",
  ): Promise<string> {
    if (pinnedStartTitle) return pinnedStartTitle;
    // Destructured so narrowing away "LLM" leaves a kind the gateway accepts.
    const { kind, value } = configuration.start;
    if (kind === "LLM") return chooseStartWithOracle(bundle);
    if (
      (kind === "RANDOM" || value.trim().length === 0) &&
      fallbackTopic.trim().length > 0
    ) {
      return (
        await bundle.wikipedia.resolveStart({
          kind: "TOPIC",
          value: fallbackTopic,
        })
      ).title;
    }
    return (await bundle.wikipedia.resolveStart({ kind, value })).title;
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
    const startTitle = await resolveStart(bundle, configuration.burke.seedText);

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
        historicalConsciousness: configuration.historicalConsciousness,
        endpointStrategy: configuration.endpointStrategy,
        checkpointInterval: configuration.burke.elasticityInterval,
        maxPages: configuration.burke.maxPages,
        branchFactor: configuration.branchFactor,
        excludeMetaPages: configuration.excludeMetaPages,
        allowRevisits: configuration.allowRevisits,
        requireMotivatedTransitions:
          configuration.burke.requireMotivatedTransitions,
        analogyTolerance: configuration.burke.analogyTolerance,
        allowProductiveDetours: configuration.burke.allowProductiveDetours,
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
            // Candidate assessments become the node's audit trail: every
            // page considered, its component scores, and why it lost.
            outgoingLinks: JSON.stringify([
              ...node.assessments.map((a) => ({
                title: a.title,
                eligible: true,
                score: a.total,
                features: a.scores as unknown as Record<string, number>,
                why: [
                  `${a.relationType}${a.analogyCarrier ? ` via ${a.analogyCarrier}` : ""}`,
                  a.rationale,
                  `predicted revision: ${a.predictedTheoryRevision}`,
                ],
              })),
              ...node.rejections.map((r) => ({
                title: r.title,
                eligible: false,
                exclusionReason: r.reason,
              })),
            ]),
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
          storyState: JSON.stringify(result.storyState),
          notes: JSON.stringify(result.notes),
          checkpoints: JSON.stringify(result.checkpoints),
          coherenceReports: JSON.stringify(result.coherenceReports),
          narrative: result.narrative
            ? JSON.stringify(result.narrative)
            : null,
          rejectedRoutes: JSON.stringify(result.rejectedRoutes),
          backtrackCount: result.backtrackCount,
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

  async function executeAnamnesisWalk(): Promise<void> {
    const sentence = configuration.anamnesis.terminalSentence.trim();
    if (sentence.length === 0) {
      throw new Error(
        "Anamnetic walks need a terminal sentence — the felt ending to arrive at",
      );
    }
    const bundle = gatewayFactory(
      configuration.language,
      configuration.maxGraphRequests,
    );
    const oracle = anamnesisOracleFactory();

    // The entry article: the configured start, or — since the walk is
    // defined by its ending rather than its beginning — a search from the
    // terminal sentence itself.
    const startTitle = await resolveStart(bundle, sentence);

    const result = await runAnamnesisWalk({
      wikipedia: bundle.wikipedia,
      oracle,
      rng: createRng(configuration.seed),
      config: {
        terminal: {
          text: sentence,
          register: configuration.anamnesis.register,
          intent: configuration.anamnesis.intent,
        },
        audienceNote: configuration.anamnesis.audienceNote,
        recollectionInterval: configuration.anamnesis.recollectionInterval,
        maxMediations: configuration.anamnesis.maxMediations,
        branchFactor: configuration.branchFactor,
        excludeMetaPages: configuration.excludeMetaPages,
        allowRevisits: configuration.allowRevisits,
        requireMotivatedTransitions:
          configuration.anamnesis.requireMotivatedTransitions,
        sentimentalityTolerance:
          configuration.anamnesis.sentimentalityTolerance,
        requireConcreteAnchors: configuration.anamnesis.requireConcreteAnchors,
      },
      startTitle,
      onProgress: async (p) => {
        await db.generationJob.update({
          where: { id: jobId },
          data: {
            progress: p.completed / p.target,
            currentStep: `${p.stage} — ${p.completed}/${p.target} mediations: ${p.currentTitle} (${p.requestsUsed} requests)`,
          },
        });
      },
    });

    if (result.visited.length === 0) {
      await failJob("Anamnetic walk visited no articles");
      return;
    }

    await db.$transaction(async (tx) => {
      await tx.sourceNode.deleteMany({ where: { projectId } });
      await tx.candidateWalk.deleteMany({ where: { projectId } });
      await tx.burkeRun.deleteMany({ where: { projectId } });
      await tx.anamnesisRun.deleteMany({ where: { projectId } });
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
            rawWalkScore:
              node.assessments.find((a) => a.title === node.info.title)?.total ??
              null,
            // Candidate assessments become the per-step audit trail.
            outgoingLinks: JSON.stringify([
              ...node.assessments.map((a) => ({
                title: a.title,
                eligible: true,
                score: a.total,
                features: a.scores as unknown as Record<string, number>,
                why: [
                  a.evidenceStatus,
                  a.rationale,
                  `would pay: ${a.predictedPayment}`,
                ],
              })),
              ...node.rejections.map((r) => ({
                title: r.title,
                eligible: false,
                exclusionReason: r.reason,
              })),
            ]),
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
      await tx.anamnesisRun.create({
        data: {
          projectId,
          schemaVersion: RUN_SCHEMA_VERSION,
          state: JSON.stringify(result.state),
          mediations: JSON.stringify(result.mediations),
          recollectionTests: JSON.stringify(result.recollectionTests),
          composition: result.composition
            ? JSON.stringify(result.composition)
            : null,
          abandonedRoutes: JSON.stringify(result.abandonedRoutes),
          endReason: result.endReason,
        },
      });
      await tx.walkProject.update({
        where: { id: projectId },
        data: { status: "WALK_READY" },
      });
    });

    const unpaid = result.state.debts.filter(
      (d) => d.status === "unpaid" || d.status === "partially_paid",
    ).length;
    await db.generationJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETE",
        progress: 1,
        currentStep: `Anamnetic walk complete: ${result.mediations.length} mediations, ${unpaid} debts outstanding, ${result.requestsUsed} requests — ${result.endReason.replaceAll("_", " ").toLowerCase()}`,
      },
    });
  }

  async function executeBurkeClusterWalk(): Promise<void> {
    const seedText = configuration.burkeCluster.seedText.trim();
    if (seedText.length === 0) {
      throw new Error(
        "BurkeCluster needs a seed — the object, question, or proposition the route culminates in",
      );
    }
    const bundle = gatewayFactory(
      configuration.language,
      configuration.maxGraphRequests,
    );
    const oracle = clusterOracleFactory();
    const bc = configuration.burkeCluster;

    // The first article is the oracle's to choose from a search over the
    // seed — unless a start was named, or a same-seed regeneration has one
    // to reproduce, in which case that page is pinned and the oracle builds
    // the seed region around it.
    // RANDOM here means "unspecified": the seed region resolution chooses
    // the whole region, head included. Every other kind — an LLM-determined
    // start among them — yields one page, pinned at the head of the region.
    const { kind: startKind, value: startValue } = configuration.start;
    const pinnedSeedTitle =
      pinnedStartTitle ??
      (startKind === "LLM"
        ? await chooseStartWithOracle(bundle)
        : startKind !== "RANDOM" && startValue.trim().length > 0
          ? (
              await bundle.wikipedia.resolveStart({
                kind: startKind,
                value: startValue,
              })
            ).title
          : undefined);

    const result = await runBurkeClusterWalk({
      wikipedia: bundle.wikipedia,
      entityFacts: bundle.entityFacts,
      oracle,
      rng: createRng(configuration.seed),
      config: {
        rawSeed: seedText,
        attentionText: bc.attentionProgram,
        pinnedSeedTitle,
        minimumSubjectCount: bc.minimumSubjectCount,
        maxSubjectDepth: bc.maxSubjectDepth,
        episodesPerCycle: bc.episodesPerCycle,
        hopsPerEpisode: bc.hopsPerEpisode,
        restartProbability: bc.restartProbability,
        maxNodesPerCycle: bc.maxNodesPerCycle,
        maxEdgesPerCycle: bc.maxEdgesPerCycle,
        secondOrderFanout: bc.secondOrderFanout,
        sharedNeighborThreshold: bc.sharedNeighborThreshold,
        minArticleLength: configuration.minArticleLength,
        excludeMetaPages: configuration.excludeMetaPages,
        minClusterSize: bc.minClusterSize,
        analogyTolerance: bc.analogyTolerance,
        endpointRigidity: bc.endpointRigidity,
        requireConcreteAnchor: bc.requireConcreteAnchor,
        maxClusterCycles: bc.maxClusterCycles,
        maxModelCalls: bc.maxModelCalls,
      },
      onProgress: async (p) => {
        await db.generationJob.update({
          where: { id: jobId },
          data: {
            progress: Math.min(1, p.completed / Math.max(1, p.target)),
            currentStep: `${p.stage} — ${p.completed}/${p.target} subjects (${p.requestsUsed} requests)`,
          },
        });
      },
    });

    if (result.state.acceptedClusters.length === 0) {
      await failJob(
        `BurkeCluster accepted no subject clusters (${result.endReason.replaceAll("_", " ").toLowerCase()})`,
      );
      return;
    }

    await db.$transaction(async (tx) => {
      await tx.sourceNode.deleteMany({ where: { projectId } });
      await tx.candidateWalk.deleteMany({ where: { projectId } });
      await tx.burkeRun.deleteMany({ where: { projectId } });
      await tx.anamnesisRun.deleteMany({ where: { projectId } });
      await tx.burkeClusterRun.deleteMany({ where: { projectId } });

      // The flowchart shows the accepted subject sequence, not the whole
      // sampled archive — hundreds of pages may be inspected while only a
      // handful become subjects.
      const sequence = [
        ...result.state.acceptedClusters.map((c) => ({
          title: c.subject.centralPageTitle ?? c.subject.label,
          summary: c.narration?.account ?? c.subject.label,
          cluster: c,
        })),
      ];
      for (let i = 0; i < sequence.length; i++) {
        const entry = sequence[i];
        const node = result.finalNodes.find((n) => n.title === entry.title);
        const created = await tx.sourceNode.create({
          data: {
            projectId,
            wikipediaPageId: -1,
            wikidataId: node?.wikidataId,
            title: entry.title,
            url: node?.url ?? "",
            summary: entry.summary.slice(0, 1200),
            categories: JSON.stringify(entry.cluster.subject.constitutivePages),
            entityTypes: JSON.stringify([entry.cluster.subject.type]),
            rawWalkScore: entry.cluster.stability,
            outgoingLinks: JSON.stringify(
              entry.cluster.packet.representativeTitles.map((title) => ({
                title,
                eligible: true,
                why: [`member of ${entry.cluster.clusterId}`],
              })),
            ),
            visitIndex: i,
          },
        });
        if (i === 0) {
          await tx.walkProject.update({
            where: { id: projectId },
            data: { startNodeId: created.id },
          });
        }
      }

      await tx.burkeClusterRun.create({
        data: {
          projectId,
          schemaVersion: RUN_SCHEMA_VERSION,
          randomSeed: configuration.seed,
          state: JSON.stringify(result.state),
          narrative: result.narrative ? JSON.stringify(result.narrative) : null,
          transitionTable: JSON.stringify(result.transitionTable),
          graphNodes: JSON.stringify(result.finalNodes.slice(0, 300)),
          graphEdges: JSON.stringify(result.finalEdges.slice(0, 2000)),
          endReason: result.endReason,
        },
      });
      await tx.walkProject.update({
        where: { id: projectId },
        data: { status: "WALK_READY" },
      });
    });

    const budget = result.state.budget;
    await db.generationJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETE",
        progress: 1,
        currentStep: `BurkeCluster complete: ${result.state.acceptedClusters.length} subjects from ${budget.sampledPages} sampled pages across ${budget.clusterCycles} cycles (${budget.modelCalls} model calls, ${result.requestsUsed} requests) — ${result.endReason.replaceAll("_", " ").toLowerCase()}`,
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
