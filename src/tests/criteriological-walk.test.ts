import { describe, expect, it } from "vitest";
import { createRng } from "@/domain/walk/prng";
import {
  runCriteriologicalWalk,
  type CriteriologicalConfig,
} from "@/domain/walk/criteriological-walk";
import { CRITERIA } from "@/domain/enums";
import { FixtureWikipediaGateway } from "@/integrations/wikipedia/fixture-gateway";

const zeroWeights = Object.fromEntries(CRITERIA.map((c) => [c, 0])) as Record<
  (typeof CRITERIA)[number],
  number
>;

const BASE: CriteriologicalConfig = {
  walkLength: 6,
  branchFactor: 8,
  allowRevisits: false,
  excludeMetaPages: true,
  minArticleLength: 500,
  criteriaWeights: zeroWeights,
  pathDescription: "",
  samplingMode: "GREEDY",
  temporalBounds: { start: null, end: null },
  maxPopularityPercentile: 100,
};

const START = "Touchstone (assaying tool)";

async function run(seed: string, config: Partial<CriteriologicalConfig> = {}) {
  const gateway = new FixtureWikipediaGateway();
  return runCriteriologicalWalk({
    wikipedia: gateway,
    entityFacts: gateway,
    rng: createRng(seed),
    config: { ...BASE, ...config },
    startTitle: START,
  });
}

describe("criteriological walk", () => {
  it("is deterministic for a given seed and configuration", async () => {
    const a = await run("crit-seed");
    const b = await run("crit-seed");
    expect(a.visited.map((v) => v.info.title)).toEqual(
      b.visited.map((v) => v.info.title),
    );
  });

  it("scores every chosen hop and records an explanation", async () => {
    const { visited } = await run("explain");
    for (const node of visited.slice(1)) {
      expect(node.score).toBeDefined();
      expect(node.features).toBeDefined();
      expect(node.why && node.why.length).toBeGreaterThan(0);
      const own = node.chosenFrom.find(
        (c) => c.title === node.info.title && c.eligible,
      );
      expect(own?.score).toBe(node.score);
    }
  });

  it("greedy mode always picks the highest-scoring eligible candidate", async () => {
    const { visited } = await run("greedy-check", { samplingMode: "GREEDY" });
    for (const node of visited.slice(1)) {
      const eligible = node.chosenFrom.filter(
        (c) => c.eligible && c.score !== undefined,
      );
      const best = Math.max(...eligible.map((c) => c.score ?? -Infinity));
      expect(node.score).toBe(best);
    }
  });

  it("weights steer the walk: temporal-heavy differs from motif-heavy", async () => {
    const temporal = await run("steer", {
      criteriaWeights: { ...zeroWeights, temporalContinuity: 5 },
    });
    const motif = await run("steer", {
      criteriaWeights: { ...zeroWeights, motifAffinity: 5, surprise: 3 },
      pathDescription:
        "Prefer transitions involving navigation, instruments, magnetism, and experiments.",
    });
    expect(temporal.visited.map((v) => v.info.title)).not.toEqual(
      motif.visited.map((v) => v.info.title),
    );
  });

  it("temporal bounds exclude candidates known to fall outside them", async () => {
    const { visited } = await run("bounds", {
      temporalBounds: { start: -700, end: 400 },
      walkLength: 5,
    });
    for (const node of visited.slice(1)) {
      for (const candidate of node.chosenFrom) {
        if (candidate.exclusionReason?.includes("temporal bounds")) {
          expect(candidate.eligible).toBe(false);
        }
      }
      // Chosen nodes with a known era must be inside the bounds.
      if (node.facts?.eraStart !== undefined && node.facts.eraEnd !== undefined) {
        expect(node.facts.eraStart).toBeLessThanOrEqual(400);
        expect(node.facts.eraEnd).toBeGreaterThanOrEqual(-700);
      }
    }
  });

  it("the popularity cap excludes high-sitelink candidates", async () => {
    const { visited } = await run("popularity", {
      maxPopularityPercentile: 20, // sitelink proxy: excludes > ~60 sitelinks
    });
    for (const node of visited.slice(1)) {
      expect(node.facts?.sitelinks ?? 0).toBeLessThanOrEqual(60);
      const excludedForPopularity = node.chosenFrom.filter((c) =>
        c.exclusionReason?.includes("popularity"),
      );
      for (const c of excludedForPopularity) expect(c.eligible).toBe(false);
    }
  });

  it("beam mode refuses loudly while feature-flagged off", async () => {
    await expect(run("beam", { samplingMode: "BEAM" })).rejects.toThrow(
      /feature-flagged/,
    );
  });
});
