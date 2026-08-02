import { describe, expect, it } from "vitest";
import {
  NEGATIVE_WEIGHTS,
  POSITIVE_WEIGHTS,
  paymentStrength,
  scoreMediation,
} from "@/domain/anamnesis/scoring";
import type { CandidateMediationScores } from "@/domain/anamnesis/types";

const ZERO: CandidateMediationScores = {
  debtPaymentPotential: 0,
  concreteAnchorStrength: 0,
  historicalSpecificity: 0,
  affectiveCharge: 0,
  preparesLaterCharges: 0,
  archivalWarrant: 0,
  novelty: 0,
  registerFit: 0,
  sourceQuality: 0,
  restatesWithoutEarning: 0,
  abstractionWithoutAnchor: 0,
  redundancy: 0,
  sentimentality: 0,
  anachronism: 0,
  decorativeDetour: 0,
};

const score = (s: Partial<CandidateMediationScores>, tolerance = 0.2) =>
  scoreMediation({ ...ZERO, ...s }, { sentimentalityTolerance: tolerance });

describe("mediation scoring", () => {
  it("ranks paying the debt above every other positive signal", () => {
    expect(POSITIVE_WEIGHTS.debtPaymentPotential!).toBeGreaterThan(
      POSITIVE_WEIGHTS.concreteAnchorStrength!,
    );
    expect(POSITIVE_WEIGHTS.concreteAnchorStrength!).toBeGreaterThan(
      POSITIVE_WEIGHTS.historicalSpecificity!,
    );
    expect(POSITIVE_WEIGHTS.historicalSpecificity!).toBeGreaterThan(
      POSITIVE_WEIGHTS.novelty!,
    );
  });

  it("scores an elaborate restatement below a plain payment", () => {
    const restatement = score({
      affectiveCharge: 1,
      novelty: 1,
      registerFit: 1,
      restatesWithoutEarning: 1,
      abstractionWithoutAnchor: 1,
    });
    const payment = score({
      debtPaymentPotential: 0.8,
      concreteAnchorStrength: 0.7,
    });
    expect(payment).toBeGreaterThan(restatement);
    expect(restatement).toBeLessThan(0);
  });

  it("penalizes anachronism — the hazard of walking toward a known ending", () => {
    const anachronistic = score({
      debtPaymentPotential: 0.7,
      concreteAnchorStrength: 0.6,
      anachronism: 1,
    });
    const sound = score({
      debtPaymentPotential: 0.7,
      concreteAnchorStrength: 0.6,
    });
    expect(sound).toBeGreaterThan(anachronistic);
    expect(sound - anachronistic).toBeCloseTo(NEGATIVE_WEIGHTS.anachronism!, 6);
  });

  it("never removes the sentimentality penalty entirely, even at full tolerance", () => {
    const scores = { debtPaymentPotential: 0.6, sentimentality: 1 };
    const austere = score(scores, 0);
    const permissive = score(scores, 1);
    const clean = score({ debtPaymentPotential: 0.6 });
    expect(permissive).toBeGreaterThan(austere);
    // Cheap feeling still costs something at maximum tolerance.
    expect(permissive).toBeLessThan(clean);
  });

  it("payment strength ignores affect, novelty, and register entirely", () => {
    expect(
      paymentStrength({
        ...ZERO,
        affectiveCharge: 1,
        novelty: 1,
        registerFit: 1,
        sourceQuality: 1,
      }),
    ).toBe(0);
    expect(
      paymentStrength({ ...ZERO, debtPaymentPotential: 1 }),
    ).toBeGreaterThan(0);
  });
});
