import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCORE_WEIGHTS,
  explanatoryGain,
  scoreCandidate,
} from "@/domain/burke/scoring";
import type { CandidateScores } from "@/domain/burke/types";

const ZERO: CandidateScores = {
  questionAnsweringPotential: 0,
  theoryRevisionPotential: 0,
  historicalDependencyStrength: 0,
  narrativeTensionGain: 0,
  causalOrInstitutionalSpecificity: 0,
  novelty: 0,
  returnPotential: 0,
  curiosityProgramFit: 0,
  sourceQuality: 0,
  lexicalSimilarityWithoutExplanatoryGain: 0,
  analogyOnlyPenalty: 0,
  redundancy: 0,
  genericAbstractionPenalty: 0,
  sensationalDetourPenalty: 0,
  seedForcingPenalty: 0,
};

const score = (s: Partial<CandidateScores>, analogyTolerance = 0.25) =>
  scoreCandidate({ ...ZERO, ...s }, { analogyTolerance });

describe("explanatory-gain scoring", () => {
  it("ranks answering the current question above every other positive", () => {
    const { positive } = DEFAULT_SCORE_WEIGHTS;
    expect(positive.questionAnsweringPotential).toBeGreaterThan(
      positive.theoryRevisionPotential,
    );
    expect(positive.theoryRevisionPotential).toBeGreaterThan(
      positive.historicalDependencyStrength,
    );
    expect(positive.historicalDependencyStrength).toBeGreaterThan(
      positive.curiosityProgramFit,
    );
    // Thematic fit is the weakest positive signal, by design.
    expect(positive.curiosityProgramFit).toBeLessThan(
      positive.narrativeTensionGain,
    );
  });

  it("scores a resemblance-only page below a question-answering page", () => {
    const resemblance = score({
      curiosityProgramFit: 1,
      novelty: 1,
      lexicalSimilarityWithoutExplanatoryGain: 1,
      seedForcingPenalty: 1,
    });
    const answering = score({
      questionAnsweringPotential: 1,
      historicalDependencyStrength: 0.8,
    });
    expect(answering).toBeGreaterThan(resemblance);
    expect(resemblance).toBeLessThan(0);
  });

  it("penalizes a sensational detour below a modest but relevant page", () => {
    const sensational = score({
      questionAnsweringPotential: 0.5,
      narrativeTensionGain: 1,
      novelty: 1,
      sensationalDetourPenalty: 1,
      seedForcingPenalty: 0.8,
    });
    const modest = score({
      questionAnsweringPotential: 0.6,
      historicalDependencyStrength: 0.5,
    });
    expect(modest).toBeGreaterThan(sensational);
  });

  it("analogy tolerance scales the analogy penalty in both directions", () => {
    const scores = { questionAnsweringPotential: 0.6, analogyOnlyPenalty: 1 };
    const strict = score(scores, 0);
    const permissive = score(scores, 1);
    expect(permissive).toBeGreaterThan(strict);
    expect(strict).toBeCloseTo(permissive - DEFAULT_SCORE_WEIGHTS.negative.analogyOnlyPenalty, 6);
  });

  it("explanatory gain ignores thematic and novelty signals entirely", () => {
    const thematic = explanatoryGain({
      ...ZERO,
      curiosityProgramFit: 1,
      novelty: 1,
      sourceQuality: 1,
    });
    const explanatory = explanatoryGain({
      ...ZERO,
      questionAnsweringPotential: 1,
    });
    expect(thematic).toBe(0);
    expect(explanatory).toBeGreaterThan(0);
  });
});
