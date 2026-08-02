import { describe, expect, it, vi } from "vitest";
import { runBurkeWalk, type BurkeEngineConfig } from "@/domain/burke/engine";
import { createRng } from "@/domain/walk/prng";
import { BURKE_QUESTIONS } from "@/domain/enums";
import { FixtureWikipediaGateway } from "@/integrations/wikipedia/fixture-gateway";
import {
  FixtureBurkeOracle,
  type FixtureOracleScript,
} from "@/integrations/llm/fixture-burke-oracle";

// The revision's central claim under test: the walker selects the next page
// by asking what the current story cannot explain — never by asking what
// resembles the seed.

const BASE: BurkeEngineConfig = {
  seed: { kind: "OBJECT", text: "LARP is a social strategy for undermining individual cunning." },
  priming:
    "Attend to public accusation, role assignment, social legibility, ritual sanction, reputation.",
  motif: "",
  historicalConsciousness: { actorHorizon: true },
  endpointStrategy: "WALK_FINAL",
  checkpointInterval: 3,
  maxPages: 8,
  branchFactor: 8,
  excludeMetaPages: true,
  allowRevisits: false,
  requireMotivatedTransitions: true,
  analogyTolerance: 0.25,
  allowProductiveDetours: false,
};

const START = "Touchstone (assaying tool)";

async function walk(
  script: FixtureOracleScript = {},
  config: Partial<BurkeEngineConfig> = {},
  oracleOverride?: FixtureBurkeOracle,
) {
  return runBurkeWalk({
    wikipedia: new FixtureWikipediaGateway(),
    oracle: oracleOverride ?? new FixtureBurkeOracle(script),
    rng: createRng("burke-revision"),
    config: { ...BASE, ...config },
    startTitle: START,
  });
}

describe("Burke walker — story-state control flow", () => {
  it("diagnoses before it ever sees candidates", async () => {
    const oracle = new FixtureBurkeOracle();
    const order: string[] = [];
    const diagnose = oracle.diagnose.bind(oracle);
    const assess = oracle.assess.bind(oracle);
    vi.spyOn(oracle, "diagnose").mockImplementation(async (input) => {
      order.push("diagnose");
      return diagnose(input);
    });
    vi.spyOn(oracle, "assess").mockImplementation(async (input) => {
      order.push("assess");
      // The question must already exist when candidates are judged.
      expect(input.navigationQuestion.length).toBeGreaterThan(0);
      return assess(input);
    });

    await walk({}, { maxPages: 4 }, oracle);

    expect(order.length).toBeGreaterThanOrEqual(2);
    expect(order[0]).toBe("diagnose");
    for (let i = 0; i < order.length - 1; i += 2) {
      expect(order[i]).toBe("diagnose");
      expect(order[i + 1]).toBe("assess");
    }
  });

  it("records the full explanatory note for every accepted node", async () => {
    const result = await walk();
    expect(result.notes.length).toBeGreaterThan(0);
    for (const note of result.notes) {
      expect(note.navigationQuestion.length).toBeGreaterThan(0);
      expect(note.claimEstablishedOrChallenged.length).toBeGreaterThan(0);
      expect(note.theoryBefore).not.toBe(note.theoryAfter);
      expect(note.newUnresolvedQuestion.length).toBeGreaterThan(0);
      expect(BURKE_QUESTIONS).toContain(note.selectedBurkeQuestion);
      expect(["direct", "deferred", "uncertain"]).toContain(note.seedRelation);
      expect(note.bridge?.standsWithoutSeed).toBe(true);
    }
  });

  it("maintains an evolving theory that differs from the initial one", async () => {
    const result = await walk();
    const initial = result.storyState.theoryVersions[0].theory;
    expect(result.storyState.currentTheory).not.toBe(initial);
    expect(result.storyState.theoryVersions.length).toBeGreaterThan(1);
    for (const version of result.storyState.theoryVersions.slice(1)) {
      expect(version.whatChanged.length).toBeGreaterThan(0);
      expect(version.supersedes).not.toBeNull();
    }
  });

  it("refuses pages that fail the acceptance gate and records why", async () => {
    const result = await walk({
      strongTitles: ["Coinage", "Alexandria", "Radar", "Nuclear physics"],
    });
    // Every visited page after the start was gate-approved…
    for (const node of result.visited.slice(1)) {
      expect(node.note).toBeDefined();
    }
    // …and resemblance-only candidates were refused with a stated reason.
    expect(result.rejectedRoutes.length).toBeGreaterThan(0);
    for (const rejection of result.rejectedRoutes) {
      expect(rejection.reason.length).toBeGreaterThan(0);
    }
  });

  it("rejects a page when no motivated bridge can be written", async () => {
    const result = await walk({
      strongTitles: ["Coinage"],
      unbridgeableTitles: ["Coinage"],
    });
    expect(result.visited.map((v) => v.info.title)).not.toContain("Coinage");
    expect(
      result.rejectedRoutes.some((r) =>
        r.reason.includes("motivated transition"),
      ),
    ).toBe(true);
  });

  it("accepts an unbridgeable page when transitions are not required", async () => {
    // Cap at two pages so the toggle's effect is observed at the moment of
    // decision, before any later dead end could backtrack the node away.
    const script = {
      strongTitles: ["Coinage"],
      unbridgeableTitles: ["Coinage"],
    };
    const withBridges = await walk(script, {
      requireMotivatedTransitions: true,
      maxPages: 2,
    });
    const without = await walk(script, {
      requireMotivatedTransitions: false,
      maxPages: 2,
    });

    expect(withBridges.visited.map((v) => v.info.title)).not.toContain("Coinage");
    expect(without.visited.map((v) => v.info.title)).toContain("Coinage");
  });

  it("backtracks away from a sensational hijack and marks the branch dead", async () => {
    const result = await walk({
      hijackAtCoherenceCall: [1],
      coherenceScores: [0.2, 0.85, 0.85],
    });
    expect(result.backtrackCount).toBeGreaterThan(0);
    expect(
      result.rejectedRoutes.some((r) => r.reason.startsWith("backtracked")),
    ).toBe(true);
  });

  it("stops at explanatory saturation after two flat checkpoints", async () => {
    const result = await walk(
      { changeClasses: ["none", "minor elaboration"] },
      { checkpointInterval: 1, maxPages: 20 },
    );
    expect(result.endReason).toBe("EXPLANATORY_SATURATION");
    expect(result.checkpoints.length).toBe(2);
  });

  it("keeps walking while checkpoints report material change", async () => {
    const result = await walk(
      {
        changeClasses: [
          "major reframing",
          "meaningful refinement",
          "reversal",
          "meaningful refinement",
        ],
      },
      { checkpointInterval: 1, maxPages: 5 },
    );
    expect(result.endReason).not.toBe("EXPLANATORY_SATURATION");
  });

  it("stops when the motivating questions are resolved", async () => {
    const result = await walk(
      { resolveQuestionsAfter: 3 },
      { maxPages: 20, checkpointInterval: 50 },
    );
    expect(result.endReason).toBe("QUESTIONS_RESOLVED");
    const highPriorityOpen = result.storyState.unresolvedQuestions.filter(
      (q) => q.status === "open" && q.priority >= 0.6,
    );
    expect(highPriorityOpen).toHaveLength(0);
  });

  it("stops on redescription when a strong return path opens", async () => {
    const result = await walk(
      { recodeAtNode: 4 },
      { maxPages: 20, checkpointInterval: 50 },
    );
    expect(result.endReason).toBe("REDESCRIPTION_ACHIEVED");
    expect(
      result.storyState.returnPaths.some((p) => p.strength >= 0.8),
    ).toBe(true);
  });

  it("produces a narrative of motivated pivots, not page summaries", async () => {
    const result = await walk();
    expect(result.narrative).not.toBeNull();
    expect(result.narrative?.hook.length).toBeGreaterThan(0);
    expect(result.narrative?.pivots.length).toBe(result.notes.length);
    for (const pivot of result.narrative?.pivots ?? []) {
      expect(pivot.motivation.length).toBeGreaterThan(0);
    }
  });

  it("keeps every candidate assessment as an audit trail", async () => {
    const result = await walk();
    for (const node of result.visited.slice(1)) {
      expect(node.assessments.length).toBeGreaterThan(0);
      // Totals are computed by the engine, so they are always populated.
      expect(node.assessments.some((a) => a.total !== 0)).toBe(true);
      // Ranking is by engine-computed total, descending.
      const totals = node.assessments.map((a) => a.total);
      expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    }
  });

  it("penalizes a claimed analogy that names no carrier", async () => {
    const result = await walk({
      strongTitles: ["Coinage", "Alexandria"],
      analogyOnlyTitles: ["Coinage"],
    });
    const assessed = result.visited
      .flatMap((v) => v.assessments)
      .find((a) => a.title === "Coinage");
    if (assessed) {
      expect(assessed.scores.analogyOnlyPenalty).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("respects the page cap as a safety net, not a goal", async () => {
    const result = await walk({}, { maxPages: 3, checkpointInterval: 50 });
    expect(result.visited.length).toBeLessThanOrEqual(3);
    expect(result.endReason).toBe("PAGE_CAP_REACHED");
  });
});
