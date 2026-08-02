import { describe, expect, it } from "vitest";
import { createRng } from "@/domain/walk/prng";
import { runRandomWalk } from "@/domain/walk/random-walk";
import type { WalkEngineConfig } from "@/domain/walk/types";
import {
  buildDemonstrationGraph,
  FixtureWikipediaGateway,
} from "@/integrations/wikipedia/fixture-gateway";

const BASE_CONFIG: WalkEngineConfig = {
  walkLength: 8,
  branchFactor: 5,
  allowRevisits: false,
  excludeMetaPages: true,
  minArticleLength: 500,
};

const START = "Touchstone (assaying tool)";

async function walkTitles(seed: string, config = BASE_CONFIG) {
  const result = await runRandomWalk({
    gateway: new FixtureWikipediaGateway(),
    rng: createRng(seed),
    config,
    startTitle: START,
  });
  return { titles: result.visited.map((v) => v.info.title), result };
}

describe("deterministic random walk", () => {
  it("same seed and configuration produce the same path", async () => {
    const a = await walkTitles("phase-two");
    const b = await walkTitles("phase-two");
    expect(a.titles).toEqual(b.titles);
    expect(a.titles[0]).toBe(START);
    expect(a.titles.length).toBeGreaterThan(1);
  });

  it("different seeds diverge on this graph", async () => {
    const runs = await Promise.all(
      ["seed-a", "seed-b", "seed-c", "seed-d"].map((s) => walkTitles(s)),
    );
    const distinct = new Set(runs.map((r) => r.titles.join(" → ")));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("never visits excluded pages", async () => {
    for (const seed of ["x1", "x2", "x3", "x4", "x5"]) {
      const { titles } = await walkTitles(seed);
      for (const title of titles) {
        expect(title).not.toMatch(/^List of|^Index of|^Comparison of/);
        expect(title).not.toMatch(/\(disambiguation\)$/);
        expect(title).not.toMatch(/^\d{1,4}$/); // bare years
        expect(title).not.toBe("Basanite stub"); // below min length
        expect(title).not.toMatch(
          /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}$/,
        );
      }
    }
  });

  it("never revisits a node when revisits are disabled", async () => {
    for (const seed of ["r1", "r2", "r3"]) {
      const { titles } = await walkTitles(seed, {
        ...BASE_CONFIG,
        walkLength: 12,
      });
      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  it("stops at target length with the right end reason", async () => {
    const { titles, result } = await walkTitles("length", {
      ...BASE_CONFIG,
      walkLength: 4,
    });
    expect(titles).toHaveLength(4);
    expect(result.endReason).toBe("TARGET_LENGTH_REACHED");
  });

  it("stops gracefully when the request budget is exhausted, keeping progress", async () => {
    const gateway = new FixtureWikipediaGateway(buildDemonstrationGraph(), 7);
    const result = await runRandomWalk({
      gateway,
      rng: createRng("budget"),
      config: { ...BASE_CONFIG, walkLength: 12 },
      startTitle: START,
    });
    expect(result.endReason).toBe("REQUEST_BUDGET_EXHAUSTED");
    expect(result.visited.length).toBeGreaterThan(0);
    expect(result.requestsUsed).toBeLessThanOrEqual(7);
  });

  it("stops when no eligible candidates remain", async () => {
    // Nuclear physics links only to Radar and Cloud chamber; visiting all
    // three then walking again exhausts candidates quickly on a long walk.
    const result = await runRandomWalk({
      gateway: new FixtureWikipediaGateway(),
      rng: createRng("dead-end"),
      config: { ...BASE_CONFIG, walkLength: 50 },
      startTitle: "Nuclear physics",
    });
    expect(result.endReason).toBe("NO_ELIGIBLE_CANDIDATES");
    expect(result.visited.length).toBeGreaterThan(0);
    expect(result.visited.length).toBeLessThan(50);
  });

  it("records the candidate pool with exclusion reasons for every hop", async () => {
    const { result } = await walkTitles("pool-audit");
    for (const node of result.visited.slice(1)) {
      expect(node.chosenFrom.length).toBeGreaterThan(0);
      const chosen = node.chosenFrom.find(
        (c) => c.title === node.info.title && c.eligible,
      );
      expect(chosen).toBeDefined();
      for (const candidate of node.chosenFrom.filter((c) => !c.eligible)) {
        expect(candidate.exclusionReason).toBeTruthy();
      }
    }
  });
});
