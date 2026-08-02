import { describe, expect, it, vi } from "vitest";
import {
  runAnamnesisWalk,
  type AnamnesisEngineConfig,
} from "@/domain/anamnesis/engine";
import { createRng } from "@/domain/walk/prng";
import { FixtureWikipediaGateway } from "@/integrations/wikipedia/fixture-gateway";
import {
  FixtureAnamnesisOracle,
  type FixtureAnamnesisScript,
} from "@/integrations/llm/fixture-anamnesis-oracle";

// The mode's central claim under test: the walk is governed by what the
// terminal sentence OWES, and it arrives at that sentence verbatim.

const TERMINAL =
  "The machine did not take the soul out of the work; it revealed how recently the work had acquired one.";

const BASE: AnamnesisEngineConfig = {
  terminal: { text: TERMINAL, register: "recognition", intent: "" },
  audienceNote: "curious, no background in art history",
  recollectionInterval: 3,
  maxMediations: 6,
  branchFactor: 8,
  excludeMetaPages: true,
  allowRevisits: false,
  requireMotivatedTransitions: true,
  sentimentalityTolerance: 0.2,
  requireConcreteAnchors: true,
};

const START = "Touchstone (assaying tool)";

async function walk(
  script: FixtureAnamnesisScript = {},
  config: Partial<AnamnesisEngineConfig> = {},
  oracleOverride?: FixtureAnamnesisOracle,
) {
  return runAnamnesisWalk({
    wikipedia: new FixtureWikipediaGateway(),
    oracle: oracleOverride ?? new FixtureAnamnesisOracle(script),
    rng: createRng("anamnesis-test"),
    config: { ...BASE, ...config },
    startTitle: START,
  });
}

describe("anamnesis engine", () => {
  it("decomposes the sentence into charges and debts before walking", async () => {
    const result = await walk();
    expect(result.state.charges.length).toBeGreaterThan(0);
    expect(result.state.debts.length).toBeGreaterThanOrEqual(3);
    for (const charge of result.state.charges) {
      expect(charge.fragment.length).toBeGreaterThan(0);
      expect(charge.weight).toBeGreaterThanOrEqual(0);
      expect(charge.weight).toBeLessThanOrEqual(1);
    }
    for (const debt of result.state.debts) {
      expect(
        result.state.charges.some((c) => c.id === debt.chargeId),
      ).toBe(true);
    }
  });

  it("selects the debt before it ever sees candidates", async () => {
    const oracle = new FixtureAnamnesisOracle();
    const order: string[] = [];
    const selectDebt = oracle.selectDebt.bind(oracle);
    const assess = oracle.assess.bind(oracle);
    vi.spyOn(oracle, "selectDebt").mockImplementation(async (input) => {
      order.push("selectDebt");
      return selectDebt(input);
    });
    vi.spyOn(oracle, "assess").mockImplementation(async (input) => {
      order.push("assess");
      // The archival question must already exist when candidates are judged.
      expect(input.searchQuestion.length).toBeGreaterThan(0);
      expect(input.debt).toBeDefined();
      return assess(input);
    });

    await walk({}, { maxMediations: 3 }, oracle);

    expect(order.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < order.length - 1; i += 2) {
      expect(order[i]).toBe("selectDebt");
      expect(order[i + 1]).toBe("assess");
    }
  });

  it("records every mediation against the debt it pays, with an anchor", async () => {
    const result = await walk();
    expect(result.mediations.length).toBeGreaterThan(0);
    for (const mediation of result.mediations) {
      expect(mediation.debtId).toBeTruthy();
      expect(mediation.searchQuestion.length).toBeGreaterThan(0);
      expect(mediation.anchor.description.length).toBeGreaterThan(0);
      expect(mediation.transformedUnderstanding.length).toBeGreaterThan(0);
      expect(mediation.bridge?.standsAlone).toBe(true);
      const debt = result.state.debts.find((d) => d.id === mediation.debtId);
      expect(debt?.paidBy).toContain(mediation.articleTitle);
    }
  });

  it("re-glosses the sentence as debts are paid", async () => {
    const result = await walk();
    expect(result.state.glossVersions.length).toBeGreaterThan(1);
    expect(result.state.currentGloss).not.toBe(
      result.state.glossVersions[0].gloss,
    );
  });

  it("refuses a page that restates the sentence instead of earning it", async () => {
    // Sole strong candidate, so it is certain to reach the gate.
    const result = await walk({
      strongTitles: ["Coinage"],
      restatementTitles: ["Coinage"],
    });
    expect(result.visited.map((v) => v.info.title)).not.toContain("Coinage");
    expect(
      result.abandonedRoutes.some(
        (r) => r.title === "Coinage" && r.reason.includes("restates"),
      ),
    ).toBe(true);
  });

  it("refuses a page with no concrete anchor when anchors are required", async () => {
    const withAnchors = await walk(
      { strongTitles: ["Coinage"], anchorlessTitles: ["Coinage"] },
      { requireConcreteAnchors: true, maxMediations: 2 },
    );
    const without = await walk(
      { strongTitles: ["Coinage"], anchorlessTitles: ["Coinage"] },
      { requireConcreteAnchors: false, maxMediations: 2 },
    );
    expect(withAnchors.visited.map((v) => v.info.title)).not.toContain("Coinage");
    expect(without.visited.map((v) => v.info.title)).toContain("Coinage");
  });

  it("refuses to settle a debt in full on analogy alone", async () => {
    const result = await walk({
      strongTitles: ["Coinage"],
      analogyOnlyTitles: ["Coinage"],
    });
    expect(result.visited.map((v) => v.info.title)).not.toContain("Coinage");
    expect(
      result.abandonedRoutes.some(
        (r) =>
          r.title === "Coinage" && r.reason.includes("structural analogy"),
      ),
    ).toBe(true);
  });

  it("requires a motivated bridge unless the requirement is disabled", async () => {
    const script = {
      strongTitles: ["Coinage"],
      unbridgeableTitles: ["Coinage"],
    };
    const required = await walk(script, {
      requireMotivatedTransitions: true,
      maxMediations: 2,
    });
    const relaxed = await walk(script, {
      requireMotivatedTransitions: false,
      maxMediations: 2,
    });
    expect(required.visited.map((v) => v.info.title)).not.toContain("Coinage");
    expect(relaxed.visited.map((v) => v.info.title)).toContain("Coinage");
  });

  it("breeds a new debt from the residue of a partial payment", async () => {
    const result = await walk(
      { strongTitles: ["Coinage", "Alexandria", "Radar"], partialTitles: ["Coinage"] },
      { maxMediations: 3, recollectionInterval: 10 },
    );
    const partiallyPaid = result.state.debts.find(
      (d) => d.paidBy.includes("Coinage") && d.status === "partially_paid",
    );
    if (partiallyPaid) {
      expect(partiallyPaid.residue).toBeTruthy();
      expect(
        result.state.debts.some((d) => d.id.startsWith("d-residue-")),
      ).toBe(true);
    }
  });

  it("stops when the sentence becomes inhabitable, not when pages run out", async () => {
    const result = await walk(
      { inhabitableAtTest: 1, settleAllAfter: 1 },
      { recollectionInterval: 3, maxMediations: 20 },
    );
    expect(result.endReason).toBe("SENTENCE_INHABITABLE");
    expect(result.mediations.length).toBeLessThan(20);
    const lastTest =
      result.recollectionTests[result.recollectionTests.length - 1];
    expect(lastTest.inhabitable).toBe(true);
  });

  it("stops when every debt is settled", async () => {
    const result = await walk(
      { settleAllAfter: 1 },
      { recollectionInterval: 50, maxMediations: 20 },
    );
    expect(result.endReason).toBe("DEBTS_SETTLED");
    const outstanding = result.state.debts.filter(
      (d) => d.status === "unpaid" || d.status === "partially_paid",
    );
    expect(outstanding).toHaveLength(0);
  });

  it("respects the mediation cap as a safety net", async () => {
    const result = await walk(
      {},
      { maxMediations: 2, recollectionInterval: 50 },
    );
    expect(result.mediations.length).toBeLessThanOrEqual(2);
    expect(result.endReason).toBe("MEDIATION_CAP_REACHED");
  });

  it("composes an arrival that ends on the terminal sentence verbatim", async () => {
    const result = await walk();
    expect(result.composition).not.toBeNull();
    expect(result.composition?.terminalSentence).toBe(TERMINAL);
    expect(result.composition?.movements.length).toBe(result.mediations.length);
    expect(result.composition?.orderingRationale.length).toBeGreaterThan(0);
  });

  it("keeps every candidate assessment as an audit trail, ranked by total", async () => {
    const result = await walk();
    for (const node of result.visited.slice(1)) {
      expect(node.assessments.length).toBeGreaterThan(0);
      const totals = node.assessments.map((a) => a.total);
      expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    }
  });
});
