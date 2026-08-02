import { weightedScore } from "@/domain/explanation/types";
import type {
  CandidateClusterScores,
  DeficiencyScores,
  SubjectScores,
} from "./types";

// Three weighted rankings, all advisory. The measurements inform the LLM's
// stratified judgment; they never mechanically determine subjecthood.
//
// Totals are computed here rather than by the model so the ranking is
// auditable and the model cannot inflate its own preference.

export const CLUSTER_POSITIVE: Partial<Record<keyof CandidateClusterScores, number>> = {
  deficiencyFit: 0.18,
  subjectEmergencePotential: 0.14,
  clusterStability: 0.12,
  complementarity: 0.11,
  historicalSpecificity: 0.1,
  immanentTransitionStrength: 0.09,
  narrativePivotPotential: 0.08,
  personalizedRelevance: 0.07,
  audienceIntelligibility: 0.06,
  concreteAnchorStrength: 0.05,
  attentionProgramFit: 0.04,
  surprise: 0.03,
  endpointReturnPotential: 0.03,
};

export const CLUSTER_NEGATIVE: Partial<Record<keyof CandidateClusterScores, number>> = {
  genericAbstraction: 0.13,
  weakDeficiencyRelation: 0.12,
  semanticRedundancy: 0.1,
  forcedHistoricalRelation: 0.09,
  listPageArtifact: 0.08,
  sensationalDetour: 0.07,
  excessiveObscurity: 0.06,
};

export const SUBJECT_POSITIVE: Partial<Record<keyof SubjectScores, number>> = {
  deficiencyResolution: 0.17,
  clusterRepresentativeness: 0.14,
  predicateInstantiation: 0.13,
  narrativeSubjecthood: 0.12,
  historicalSpecificity: 0.11,
  immanentPivotStrength: 0.1,
  bridgeCapacity: 0.08,
  audienceIntelligibility: 0.06,
  archivalSupport: 0.04,
  concreteScenePotential: 0.03,
  attentionProgramFit: 0.02,
};

export const SUBJECT_NEGATIVE: Partial<Record<keyof SubjectScores, number>> = {
  genericAbstraction: 0.12,
  merelyAssociativeRelation: 0.11,
  forcedCausality: 0.1,
  clusterMisrepresentation: 0.08,
  excessiveObscurity: 0.07,
};

export const DEFICIENCY_POSITIVE: Partial<Record<keyof DeficiencyScores, number>> = {
  importanceToCurrentSubject: 0.22,
  narrativePressure: 0.18,
  historicalDepthPotential: 0.15,
  capacityToGenerateConcreteSubject: 0.13,
  relationToSeed: 0.11,
  attentionProgramFit: 0.09,
  audiencePotential: 0.07,
  surprisePotential: 0.05,
};

export const DEFICIENCY_NEGATIVE: Partial<Record<keyof DeficiencyScores, number>> = {
  genericness: 0.14,
  redundancy: 0.12,
  excessiveAbstraction: 0.1,
  weakArchivalSearchability: 0.08,
};

export function scoreCluster(
  scores: CandidateClusterScores,
  options: { analogyTolerance: number },
): number {
  // Analogy tolerance scales the forced-relation penalty: at 0, a cluster
  // whose only tie is morphological is heavily punished.
  const negative = {
    ...CLUSTER_NEGATIVE,
    forcedHistoricalRelation:
      (CLUSTER_NEGATIVE.forcedHistoricalRelation ?? 0) *
      (1 - 0.6 * Math.max(0, Math.min(1, options.analogyTolerance))),
  };
  return weightedScore(scores, CLUSTER_POSITIVE, negative);
}

export function scoreSubject(scores: SubjectScores): number {
  return weightedScore(scores, SUBJECT_POSITIVE, SUBJECT_NEGATIVE);
}

export function scoreDeficiency(scores: DeficiencyScores): number {
  return weightedScore(scores, DEFICIENCY_POSITIVE, DEFICIENCY_NEGATIVE);
}

/** What actually constitutes bearing the deficiency, ignoring flourish. */
export function deficiencyBearing(scores: CandidateClusterScores): number {
  return (
    scores.deficiencyFit * 0.45 +
    scores.subjectEmergencePotential * 0.35 +
    scores.immanentTransitionStrength * 0.2
  );
}
