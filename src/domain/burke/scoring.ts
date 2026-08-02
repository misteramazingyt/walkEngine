import type { CandidateScores } from "./types";

// Explanatory-gain scoring. The hierarchy matters more than the exact
// numbers: answer the current question, then revise the theory, then
// strengthen the historical thread, and only then consider thematic fit.
// Lexical resemblance without explanatory gain is penalized, not rewarded.

export interface ScoreWeights {
  positive: Record<keyof PositiveScores, number>;
  negative: Record<keyof NegativeScores, number>;
}

type PositiveScores = Pick<
  CandidateScores,
  | "questionAnsweringPotential"
  | "theoryRevisionPotential"
  | "historicalDependencyStrength"
  | "narrativeTensionGain"
  | "causalOrInstitutionalSpecificity"
  | "novelty"
  | "returnPotential"
  | "curiosityProgramFit"
  | "sourceQuality"
>;

type NegativeScores = Pick<
  CandidateScores,
  | "lexicalSimilarityWithoutExplanatoryGain"
  | "analogyOnlyPenalty"
  | "redundancy"
  | "genericAbstractionPenalty"
  | "sensationalDetourPenalty"
  | "seedForcingPenalty"
>;

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  positive: {
    questionAnsweringPotential: 0.24,
    theoryRevisionPotential: 0.18,
    historicalDependencyStrength: 0.14,
    narrativeTensionGain: 0.12,
    causalOrInstitutionalSpecificity: 0.1,
    novelty: 0.08,
    returnPotential: 0.07,
    curiosityProgramFit: 0.04,
    sourceQuality: 0.03,
  },
  negative: {
    lexicalSimilarityWithoutExplanatoryGain: 0.16,
    analogyOnlyPenalty: 0.14,
    redundancy: 0.12,
    genericAbstractionPenalty: 0.1,
    sensationalDetourPenalty: 0.1,
    seedForcingPenalty: 0.08,
  },
};

/**
 * Weighted total. Computed by the engine rather than the model so the
 * ranking is auditable and the model cannot inflate its own preference.
 * `analogyTolerance` (0–1) scales the analogy-only penalty: at 0 analogies
 * are heavily punished, at 1 they are merely labeled.
 */
export function scoreCandidate(
  scores: CandidateScores,
  options: { analogyTolerance: number; weights?: ScoreWeights },
): number {
  const weights = options.weights ?? DEFAULT_SCORE_WEIGHTS;
  let total = 0;
  for (const [key, weight] of Object.entries(weights.positive) as Array<
    [keyof PositiveScores, number]
  >) {
    total += weight * scores[key];
  }
  for (const [key, weight] of Object.entries(weights.negative) as Array<
    [keyof NegativeScores, number]
  >) {
    const scale =
      key === "analogyOnlyPenalty"
        ? 1 - Math.max(0, Math.min(1, options.analogyTolerance))
        : 1;
    total -= weight * scale * scores[key];
  }
  return total;
}

/** Sum of the criteria that constitute genuine explanatory gain. */
export function explanatoryGain(scores: CandidateScores): number {
  return (
    scores.questionAnsweringPotential * 0.4 +
    scores.theoryRevisionPotential * 0.35 +
    scores.historicalDependencyStrength * 0.25
  );
}
