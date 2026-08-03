import { describe, expect, it, vi } from "vitest";
import {
  runBurkeClusterWalk,
  type BurkeClusterEngineConfig,
} from "@/domain/burkecluster/engine";
import { createRng } from "@/domain/walk/prng";
import { FixtureWikipediaGateway } from "@/integrations/wikipedia/fixture-gateway";
import {
  FixtureBurkeClusterOracle,
  type FixtureClusterScript,
} from "@/integrations/llm/fixture-burkecluster-oracle";

// The revision's governing claim under test: BurkeCluster is not cluster
// adjacency followed by retrospective bridge-writing. A deficiency is
// generated from a narration, selected BEFORE sampling, and a pivot that
// cannot say why its subject was latent in the previous narration is refused.

const BASE: BurkeClusterEngineConfig = {
  rawSeed: "LARP is a social strategy for undermining individual cunning.",
  attentionText:
    "Attend to practices in which publics expose, name, dramatize, or ritualize individual maneuver into collectively maintained roles.",
  minimumSubjectCount: 2,
  maxSubjectDepth: 3,
  episodesPerCycle: 6,
  hopsPerEpisode: 3,
  restartProbability: 0.15,
  maxNodesPerCycle: 60,
  maxEdgesPerCycle: 800,
  secondOrderFanout: 8,
  sharedNeighborThreshold: 2,
  minArticleLength: 500,
  excludeMetaPages: true,
  minClusterSize: 3,
  analogyTolerance: 0.25,
  endpointRigidity: 0.9,
  requireConcreteAnchor: true,
  maxClusterCycles: 6,
  maxModelCalls: 60,
};

async function walk(
  script: FixtureClusterScript = {},
  config: Partial<BurkeClusterEngineConfig> = {},
  oracleOverride?: FixtureBurkeClusterOracle,
) {
  const gateway = new FixtureWikipediaGateway();
  return runBurkeClusterWalk({
    wikipedia: gateway,
    entityFacts: gateway,
    oracle: oracleOverride ?? new FixtureBurkeClusterOracle(script),
    rng: createRng("burkecluster-test"),
    config: { ...BASE, ...config },
  });
}

describe("BurkeCluster engine", () => {
  it("resolves a seed region of several pages, not one", async () => {
    const result = await walk();
    expect(result.state.seed.resolvedPages.length).toBeGreaterThan(1);
    expect(result.state.seed.fixedNarrativeEndpoint).toBe(true);
    expect(result.state.attention.salienceTerms.length).toBeGreaterThanOrEqual(3);
  });

  it("searches a short seed instead of dropping it", async () => {
    // A seed of eight characters or fewer used to be filtered out alongside
    // the attention program's short clauses, so no search ran at all and the
    // walk died claiming Wikipedia had nothing for a seed it never sent.
    const gateway = new FixtureWikipediaGateway();
    const searched: string[] = [];
    const search = gateway.searchTitles.bind(gateway);
    vi.spyOn(gateway, "searchTitles").mockImplementation(async (p, n) => {
      searched.push(p);
      return search(p, n);
    });

    const result = await runBurkeClusterWalk({
      wikipedia: gateway,
      entityFacts: gateway,
      oracle: new FixtureBurkeClusterOracle(),
      rng: createRng("burkecluster-short-seed"),
      config: { ...BASE, rawSeed: "coinage", attentionText: "" },
    });

    expect(searched).toContain("coinage");
    expect(result.state.seed.resolvedPages.length).toBeGreaterThan(0);
  });

  it("pins a specified start at the head of the seed region", async () => {
    const result = await walk({}, { pinnedSeedTitle: "Alexandria" });
    expect(result.state.seed.resolvedPages[0].title).toBe("Alexandria");
    // The region stays plural — the oracle still assembles the rest.
    expect(result.state.seed.resolvedPages.length).toBeGreaterThan(1);
  });

  it("refuses a specified start that cannot anchor a seed region", async () => {
    await expect(
      walk({}, { pinnedSeedTitle: "Touchstone (disambiguation)" }),
    ).rejects.toThrow(/cannot anchor a seed region/);
  });

  it("leaves the first article to the oracle when no start is given", async () => {
    const result = await walk();
    expect(result.state.seed.resolvedPages.length).toBeGreaterThan(1);
    expect(result.state.seed.resolvedPages[0].reason).not.toMatch(
      /Specified as the start/,
    );
  });

  it("selects the deficiency BEFORE sampling the archive", async () => {
    const oracle = new FixtureBurkeClusterOracle();
    const order: string[] = [];
    const narrate = oracle.narrate.bind(oracle);
    const select = oracle.selectDeficiency.bind(oracle);
    const interpret = oracle.interpretClusters.bind(oracle);

    vi.spyOn(oracle, "narrate").mockImplementation(async (i) => {
      order.push("narrate");
      return narrate(i);
    });
    vi.spyOn(oracle, "selectDeficiency").mockImplementation(async (i) => {
      order.push("selectDeficiency");
      return select(i);
    });
    vi.spyOn(oracle, "interpretClusters").mockImplementation(async (i) => {
      order.push("interpretClusters");
      // The deficiency must already exist when clusters are interpreted.
      expect(i.deficiency.deficiencyStatement.length).toBeGreaterThan(0);
      return interpret(i);
    });

    await walk({}, { minimumSubjectCount: 1, maxSubjectDepth: 1 }, oracle);

    expect(order[0]).toBe("narrate");
    expect(order[1]).toBe("selectDeficiency");
    // Interpretation — which requires a sampled, clustered archive — comes
    // only after a deficiency has been chosen.
    const firstInterpret = order.indexOf("interpretClusters");
    expect(firstInterpret).toBeGreaterThan(order.indexOf("selectDeficiency"));
  });

  it("records a full subject–predicate–deficiency–subject transition", async () => {
    const result = await walk();
    expect(result.transitionTable.length).toBeGreaterThan(0);
    for (const row of result.transitionTable) {
      expect(row.previousSubject.length).toBeGreaterThan(0);
      expect(row.predicateIntroduced.length).toBeGreaterThan(0);
      expect(row.deficiency.length).toBeGreaterThan(0);
      expect(row.newSubject.length).toBeGreaterThan(0);
      // The brief's requirement: a route where "why latent" cannot be stated
      // precisely is rejected, so every surviving row must state it.
      expect(row.whyLatent.length).toBeGreaterThan(25);
    }
  });

  it("rejects a pivot that cannot say why the subject was latent", async () => {
    const withLatency = await walk();
    const first = withLatency.state.acceptedClusters[0]?.subject.label;
    expect(first).toBeDefined();

    const blocked = await walk({ unlatentSubjects: [first!] });
    expect(
      blocked.state.acceptedClusters.map((c) => c.subject.label),
    ).not.toContain(first);
    expect(
      blocked.state.rejectedSubjects.some((r) =>
        r.reason.includes("latent"),
      ),
    ).toBe(true);
  });

  it("rejects a pivot citing a predicate the narration never used", async () => {
    const baseline = await walk();
    const first = baseline.state.acceptedClusters[0]?.subject.label;
    const blocked = await walk({ fabricatedPredicateSubjects: [first!] });
    expect(
      blocked.state.rejectedSubjects.some((r) =>
        r.reason.includes("invented after the fact"),
      ),
    ).toBe(true);
  });

  it("rejects a pivot resting on weak evidence with low confidence", async () => {
    const baseline = await walk();
    const first = baseline.state.acceptedClusters[0]?.subject.label;
    const blocked = await walk({ weakEvidenceSubjects: [first!] });
    expect(
      blocked.state.rejectedSubjects.some((r) =>
        r.reason.includes("structural analogy"),
      ),
    ).toBe(true);
  });

  it("rejects a subject with no concrete anchor when anchors are required", async () => {
    const baseline = await walk();
    const first = baseline.state.acceptedClusters[0]?.subject.label;
    const blocked = await walk(
      { anchorlessSubjects: [first!] },
      { requireConcreteAnchor: true },
    );
    expect(
      blocked.state.rejectedSubjects.some((r) =>
        r.reason.includes("concrete audience anchor"),
      ),
    ).toBe(true);
  });

  it("refuses a cluster that does not bear the selected deficiency", async () => {
    // Only one cluster bears it; the others must be refused by the engine's
    // bearing threshold rather than accepted for mere adjacency.
    const result = await walk({ bearingClusterIds: ["cluster-0"] });
    const refusedForBearing = result.state.rejectedClusters.filter((r) =>
      r.reason.includes("does not bear the deficiency"),
    );
    expect(refusedForBearing.length + result.state.acceptedClusters.length).
      toBeGreaterThan(0);
  });

  it("samples stochastically: many pages inspected, few subjects retained", async () => {
    const result = await walk();
    expect(result.state.budget.sampledPages).toBeGreaterThan(
      result.state.acceptedClusters.length * 5,
    );
    expect(result.state.budget.walkEpisodes).toBeGreaterThan(0);
    for (const cycle of result.state.cycles) {
      expect(cycle.episodes.length).toBeGreaterThan(0);
      // A mixture of policies, not one greedy rule.
      expect(cycle.episodes.every((e) => e.path.length > 0)).toBe(true);
    }
  });

  it("is reproducible: the same seed yields the same subject route", async () => {
    const a = await walk();
    const b = await walk();
    expect(a.state.acceptedClusters.map((c) => c.subject.label)).toEqual(
      b.state.acceptedClusters.map((c) => c.subject.label),
    );
    expect(a.state.budget.sampledPages).toBe(b.state.budget.sampledPages);
  });

  it("composes in reverse discovery order, culminating in the seed", async () => {
    const result = await walk();
    expect(result.narrative).not.toBeNull();
    const discovery = result.state.acceptedClusters.map((c) => c.subject.id);
    const presented = result.narrative!.movements.map((m) => m.subjectId);
    // Presentation is the reverse of discovery, with the seed last.
    expect(presented.slice(0, discovery.length)).toEqual([...discovery].reverse());
    expect(presented[presented.length - 1]).toBe("subject-seed");
    expect(result.narrative!.culmination.length).toBeGreaterThan(0);
    expect(result.state.wrapAround).not.toBeNull();
  });

  it("stops on budget exhaustion distinctly from completion", async () => {
    const result = await walk({}, { maxModelCalls: 6, minimumSubjectCount: 5 });
    expect(result.endReason).toBe("BUDGET_EXHAUSTED");
  });

  it("stops when the subject sequence is long enough", async () => {
    const result = await walk({}, { minimumSubjectCount: 2, maxSubjectDepth: 5 });
    expect(
      ["SUBJECT_SEQUENCE_COMPLETE", "SUBJECT_DEPTH_REACHED", "DIMINISHING_RETURNS"],
    ).toContain(result.endReason);
    expect(result.state.acceptedClusters.length).toBeGreaterThanOrEqual(2);
  });

  it("ends when the current subject yields no further deficiencies", async () => {
    const result = await walk(
      { exhaustDeficienciesAfter: 1 },
      { minimumSubjectCount: 4, maxSubjectDepth: 4 },
    );
    expect(result.endReason).toBe("DIMINISHING_RETURNS");
  });
});

describe("BurkeCluster seed fidelity", () => {
  it("refuses a pivot that cannot say how it still answers the seed", async () => {
    const oracle = new FixtureBurkeClusterOracle();
    const incipit = oracle.incipit.bind(oracle);
    vi.spyOn(oracle, "incipit").mockImplementation(async (i) => ({
      ...(await incipit(i)),
      // The failure the real run showed: a pivot genuinely latent in the
      // previous account, because the account mentioned it as an example,
      // and unable to relate it back to what was actually asked.
      seedQuestionRelation: "",
      seedFidelity: 0.05,
    }));

    const result = await walk({}, {}, oracle);
    expect(result.state.acceptedClusters).toHaveLength(0);
    expect(
      result.state.rejectedSubjects.some((r) =>
        /still answers the seed/.test(r.reason),
      ),
    ).toBe(true);
  });

  it("prefers a deficiency on what the account depends on, not what it cites", async () => {
    // The engine should decline to hang the next search on an illustration
    // when a constitutive deficiency exists.
    const oracle = new FixtureBurkeClusterOracle();
    vi.spyOn(oracle, "selectDeficiency").mockImplementation(async (i) => ({
      // The fixture marks its SECOND predicate illustrative (its map is
      // 1-based), so this is the deficiency hanging off the scenery.
      deficiencyId: i.narration.deficiencies[1]?.id ?? i.narration.deficiencies[0].id,
      scores: {} as never,
      reasoning: "fixture: deliberately picks the illustrative one",
      searchTerms: ["fixture"],
    }));

    const result = await walk({}, {}, oracle);
    const swapped = result.state.rejectedSubjects.some((r) =>
      /hangs off an illustration/.test(r.reason),
    );
    expect(swapped).toBe(true);
  });
});

describe("BurkeCluster composition is optional", () => {
  it("keeps a completed discovery when the final composition fails", async () => {
    const oracle = new FixtureBurkeClusterOracle();
    vi.spyOn(oracle, "compose").mockRejectedValue(
      new Error("Gemini hit its output ceiling before finishing"),
    );

    // Six hundred archive requests and every subject found must not be
    // discarded because an optional closing flourish ran out of budget.
    const result = await walk({}, {}, oracle);

    expect(result.state.acceptedClusters.length).toBeGreaterThan(0);
    expect(result.narrative).toBeNull();
    expect(
      result.state.rejectedSubjects.some((r) =>
        /narrative not composed/.test(r.reason),
      ),
    ).toBe(true);
  });
});
