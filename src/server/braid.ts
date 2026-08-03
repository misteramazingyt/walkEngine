import { z } from "zod";
import { composeBraid } from "@/domain/braid/compose";
import { BRAID_DEFAULTS, type BraidComposition, type BraidPlan } from "@/domain/braid/types";
import type { BurkeClusterState } from "@/domain/burkecluster/types";
import { prisma } from "@/server/db";
import { createBraidOracle } from "@/server/oracle-factory";
import type { PrismaClient } from "@/generated/prisma/client";

// Braiding runs over a BurkeCluster walk that has already happened. No
// sampling, no clustering, no further archive requests: the subjects are
// the ones that run accepted, plus the runners-up it interpreted and threw
// away. The only cost is composition.

export const braidInputSchema = z.object({
  topicBeats: z.number().int().min(1).max(6).default(BRAID_DEFAULTS.topicBeats),
  liveTarget: z.number().int().min(2).max(30).default(BRAID_DEFAULTS.liveTarget),
  plantLead: z.number().int().min(0).max(4).default(BRAID_DEFAULTS.plantLead),
  tailBeats: z.number().int().min(0).max(12).default(BRAID_DEFAULTS.tailBeats),
});
export type BraidInput = z.infer<typeof braidInputSchema>;

export interface BraidDto {
  diagnostics: BraidPlan["diagnostics"];
  config: BraidInput;
  composition: BraidComposition;
  createdAt: string;
}

export async function getBraid(
  projectId: string,
  db: PrismaClient = prisma,
): Promise<BraidDto | null> {
  const run = await db.burkeClusterRun.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  if (!run?.braid) return null;
  return JSON.parse(run.braid) as BraidDto;
}

export async function buildBraid(
  projectId: string,
  input: BraidInput,
  db: PrismaClient = prisma,
  oracleFactory = createBraidOracle,
): Promise<
  { ok: true; braid: BraidDto } | { ok: false; status: number; error: string }
> {
  const config = braidInputSchema.parse(input);
  const run = await db.burkeClusterRun.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  if (!run) {
    return {
      ok: false,
      status: 409,
      error:
        "Braiding rewrites a BurkeCluster walk; run one for this project first",
    };
  }

  const state = JSON.parse(run.state) as BurkeClusterState;
  const seedLabel =
    state.currentSubject?.label ?? state.seed.rawInput ?? "the seed";

  // The sampled archive, stored with the run, is what makes pages usable as
  // topics: a title alone could be named but not written about.
  const nodes = JSON.parse(run.graphNodes || "[]") as Array<{
    title: string;
    summary?: string;
    url?: string;
  }>;
  const pages = new Map(
    nodes.map((n) => [
      n.title,
      { title: n.title, summary: n.summary ?? "", url: n.url },
    ]),
  );

  const { plan, composition } = await composeBraid({
    source: { state, pages },
    oracle: oracleFactory(),
    config,
    seedLabel,
  });

  const braid: BraidDto = {
    diagnostics: plan.diagnostics,
    config,
    composition,
    createdAt: new Date().toISOString(),
  };
  await db.burkeClusterRun.update({
    where: { id: run.id },
    data: { braid: JSON.stringify(braid) },
  });
  return { ok: true, braid };
}
