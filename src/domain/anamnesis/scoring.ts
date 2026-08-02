import { weightedScore } from "@/domain/explanation/types";
import type { CandidateMediationScores } from "./types";

// Mediation scoring. The hierarchy: pay the selected debt, supply something
// concrete the reader can hold, be historically specific — and only then
// consider anything else.
//
// The penalties are chosen for the failure modes this mode is prone to.
// A walk chasing a *felt* ending will drift toward sentimentality (cheap
// emotional appeal that earns nothing) and anachronism (reading the present
// backwards into the archive so the ending seems foretold). Both are scored
// against explicitly, because both feel like progress while producing none.

export const POSITIVE_WEIGHTS: Partial<Record<keyof CandidateMediationScores, number>> = {
  debtPaymentPotential: 0.26,
  concreteAnchorStrength: 0.16,
  historicalSpecificity: 0.13,
  affectiveCharge: 0.11,
  preparesLaterCharges: 0.1,
  archivalWarrant: 0.08,
  novelty: 0.06,
  registerFit: 0.05,
  sourceQuality: 0.05,
};

export const NEGATIVE_WEIGHTS: Partial<Record<keyof CandidateMediationScores, number>> = {
  restatesWithoutEarning: 0.16,
  abstractionWithoutAnchor: 0.14,
  redundancy: 0.12,
  sentimentality: 0.1,
  anachronism: 0.09,
  decorativeDetour: 0.08,
};

/**
 * Weighted total, computed here rather than by the model so the ranking is
 * auditable and the model cannot inflate its own preference.
 * `sentimentalityTolerance` (0–1) scales the sentimentality penalty: some
 * registers (grief) legitimately want more affective material than others
 * (irony), but the penalty is never removed entirely.
 */
export function scoreMediation(
  scores: CandidateMediationScores,
  options: { sentimentalityTolerance: number },
): number {
  const tolerance = Math.max(0, Math.min(1, options.sentimentalityTolerance));
  const negative = {
    ...NEGATIVE_WEIGHTS,
    // Floor at 40% of the penalty: cheap feeling is never free.
    sentimentality: (NEGATIVE_WEIGHTS.sentimentality ?? 0) * (1 - 0.6 * tolerance),
  };
  return weightedScore(scores, POSITIVE_WEIGHTS, negative);
}

/** What actually constitutes payment, ignoring flourish. */
export function paymentStrength(scores: CandidateMediationScores): number {
  return (
    scores.debtPaymentPotential * 0.5 +
    scores.concreteAnchorStrength * 0.3 +
    scores.historicalSpecificity * 0.2
  );
}
