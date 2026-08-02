import { describe, expect, it } from "vitest";
import { runBurkeWalk, type BurkeEngineConfig } from "@/domain/burke/engine";
import { createRng } from "@/domain/walk/prng";
import { BURKE_QUESTIONS } from "@/domain/enums";
import { FixtureWikipediaGateway } from "@/integrations/wikipedia/fixture-gateway";
import { FixtureBurkeOracle } from "@/integrations/llm/fixture-burke-oracle";

const BASE: BurkeEngineConfig = {
  seed: { kind: "OBJECT", text: "AI slop is soulless." },
  priming:
    "Attend to uniqueness, mass production, authenticity, mechanism, taste, reproduction.",
  motif: "",
  elasticityInterval: 3,
  maxPages: 10,
  branchFactor: 8,
  excludeMetaPages: true,
  allowRevisits: false,
};

const START = "Touchstone (assaying tool)";

async function walk(
  oracle: FixtureBurkeOracle,
  config: Partial<BurkeEngineConfig> = {},
) {
  return runBurkeWalk({
    wikipedia: new FixtureWikipediaGateway(),
    oracle,
    rng: createRng("burke-test"),
    config: { ...BASE, ...config },
    startTitle: START,
  });
}

describe("Burke walk engine", () => {
  it("walks, taking a four-field note at every step after the start", async () => {
    const result = await walk(new FixtureBurkeOracle());
    expect(result.visited.length).toBeGreaterThan(1);
    expect(result.notes).toHaveLength(result.visited.length - 1);
    for (const note of result.notes) {
      expect(note.observation.length).toBeGreaterThan(0);
      expect(note.changedUnderstanding.length).toBeGreaterThan(0);
      expect(note.returnToSeed.length).toBeGreaterThan(0);
      expect(BURKE_QUESTIONS).toContain(note.question);
    }
    expect(result.salience.length).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic with a deterministic oracle", async () => {
    const a = await walk(new FixtureBurkeOracle());
    const b = await walk(new FixtureBurkeOracle());
    expect(a.visited.map((v) => v.info.title)).toEqual(
      b.visited.map((v) => v.info.title),
    );
    expect(a.notes.map((n) => n.question)).toEqual(b.notes.map((n) => n.question));
  });

  it("stops when the oracle declares redescription achieved", async () => {
    const result = await walk(new FixtureBurkeOracle({ redescribeAtNote: 3 }));
    expect(result.endReason).toBe("REDESCRIPTION_ACHIEVED");
    expect(result.notes).toHaveLength(3);
    expect(result.finalRedescription.length).toBeGreaterThan(0);
  });

  it("stops at explanatory saturation when the story stops changing", async () => {
    const result = await walk(
      new FixtureBurkeOracle({ stabilizeAfterCheckpoint: 1 }),
      { elasticityInterval: 3, maxPages: 30 },
    );
    expect(result.endReason).toBe("EXPLANATORY_SATURATION");
    expect(result.checkpoints.length).toBeGreaterThanOrEqual(2);
    const last = result.checkpoints[result.checkpoints.length - 1];
    expect(last.changedSubstantially).toBe(false);
  });

  it("takes elasticity checkpoints on the configured cadence", async () => {
    const result = await walk(new FixtureBurkeOracle(), {
      elasticityInterval: 3,
      maxPages: 8,
    });
    for (const checkpoint of result.checkpoints) {
      // afterPages counts visited pages: notes are pages-1, cadence on notes.
      expect((checkpoint.afterPages - 1) % 3).toBe(0);
    }
    expect(result.checkpoints.length).toBeGreaterThan(0);
  });

  it("never traverses a candidate the oracle discarded", async () => {
    const discarded = ["Coinage", "Lydia", "Gold"];
    const result = await walk(new FixtureBurkeOracle({ discardTitles: discarded }));
    for (const node of result.visited) {
      expect(discarded).not.toContain(node.info.title);
    }
    // The discard judgments are preserved for audit.
    const withDiscards = result.visited
      .slice(1)
      .flatMap((v) => v.judgments)
      .filter((j) => j.discarded);
    expect(withDiscards.length).toBeGreaterThan(0);
    for (const j of withDiscards) expect(j.returnPotential).toBe(0);
  });

  it("respects the page cap as a safety net", async () => {
    const result = await walk(new FixtureBurkeOracle(), {
      maxPages: 4,
      elasticityInterval: 10,
    });
    expect(result.visited.length).toBeLessThanOrEqual(4);
    expect(result.endReason).toBe("PAGE_CAP_REACHED");
  });

  it("preferred motif questions constrain the grammar", async () => {
    const result = await walk(new FixtureBurkeOracle(), {
      motif: "Authenticity under Mechanization",
      maxPages: 6,
    });
    for (const note of result.notes) {
      expect(["PRECONDITION", "TRANSFORMATION", "ANALOGY"]).toContain(note.question);
    }
  });
});
