import { describe, expect, it } from "vitest";
import {
  computeCandidateFeatures,
  emptyPathAggregate,
  scoreCandidate,
  scorePath,
  updatePathAggregate,
  type CandidateFeatures,
} from "@/domain/walk/features";
import { CRITERIA } from "@/domain/enums";
import type { ArticleInfo, EntityFacts } from "@/domain/walk/types";

function info(title: string, summary: string, length = 10000): ArticleInfo {
  return {
    pageId: 1,
    title,
    url: `https://x/${title}`,
    length,
    isDisambiguation: false,
    summary,
    missing: false,
    wikidataId: `Q-${title}`,
  };
}

function facts(partial: Partial<EntityFacts> & { qid: string }): EntityFacts {
  return {
    instanceOfLabels: [],
    sitelinks: 20,
    claimTargetQids: [],
    ...partial,
  };
}

const zeroWeights = Object.fromEntries(CRITERIA.map((c) => [c, 0])) as Record<
  (typeof CRITERIA)[number],
  number
>;

describe("candidate features", () => {
  it("normalizes every feature to [0, 1]", () => {
    const path = emptyPathAggregate();
    updatePathAggregate(path, {
      categories: ["Navigation"],
      facts: facts({ qid: "Q-a", instanceOfLabels: ["human"], eraStart: 1700, eraEnd: 1750, coord: { lat: 50, lon: 0 } }),
    });
    const features = computeCandidateFeatures({
      candidate: info("Marine chronometer", "A precise clock used in navigation at sea."),
      candidateFacts: facts({ qid: "Q-b", instanceOfLabels: ["instrument"], eraStart: 1730, eraEnd: 1800, coord: { lat: 51, lon: 0 }, sitelinks: 42 }),
      current: info("Oceanic navigation", "Navigation at sea beyond sight of land."),
      currentFacts: facts({ qid: "Q-a", eraStart: 1700, eraEnd: 1900, coord: { lat: 50, lon: 0 }, claimTargetQids: ["Q-b"] }),
      path,
      pathDescription: "prefer navigation instruments and standardization",
    });
    for (const [key, value] of Object.entries(features)) {
      expect(value, key).toBeGreaterThanOrEqual(0);
      expect(value, key).toBeLessThanOrEqual(1);
    }
    expect(features.documentedRelation).toBe(1);
    expect(features.temporalContinuity).toBeGreaterThan(0.5);
    expect(features.geographicContinuity).toBeGreaterThan(0.5);
  });

  it("treats missing facts as neutral, never as punishment", () => {
    const features = computeCandidateFeatures({
      candidate: info("Mystery article", "Nothing is known."),
      current: info("Origin", "The starting point."),
      path: emptyPathAggregate(),
      pathDescription: "",
    });
    expect(features.temporalContinuity).toBe(0.5);
    expect(features.geographicContinuity).toBe(0.5);
    expect(features.entityTypeDiversity).toBe(0.5);
    expect(features.motifAffinity).toBe(0.5);
    expect(features.documentedRelation).toBe(0);
  });

  it("penalizes biography-heavy paths and repeated types", () => {
    const path = emptyPathAggregate();
    for (let i = 0; i < 3; i++) {
      updatePathAggregate(path, {
        categories: ["People"],
        facts: facts({ qid: `Q-h${i}`, instanceOfLabels: ["human"], eraStart: 1600 + i, eraEnd: 1670 + i }),
      });
    }
    const anotherHuman = computeCandidateFeatures({
      candidate: info("Yet Another Scholar", "A scholar of the seventeenth century."),
      candidateFacts: facts({ qid: "Q-h9", instanceOfLabels: ["human"], eraStart: 1610, eraEnd: 1680 }),
      current: info("A Scholar", "Another scholar."),
      currentFacts: facts({ qid: "Q-h2" }),
      path,
      pathDescription: "",
    });
    expect(anotherHuman.repetitionPenalty).toBeGreaterThanOrEqual(0.7); // type + century + biography

    const freshInstrument = computeCandidateFeatures({
      candidate: info("Astrolabe", "An instrument for taking celestial altitudes."),
      candidateFacts: facts({ qid: "Q-i1", instanceOfLabels: ["instrument"], eraStart: 1400 }),
      current: info("A Scholar", "Another scholar."),
      currentFacts: facts({ qid: "Q-h2" }),
      path,
      pathDescription: "",
    });
    expect(freshInstrument.repetitionPenalty).toBeLessThan(anotherHuman.repetitionPenalty);
    expect(freshInstrument.entityTypeDiversity).toBe(1);
  });
});

describe("candidate scoring", () => {
  const baseFeatures: CandidateFeatures = {
    semanticSimilarity: 0.5,
    semanticDistance: 0.5,
    temporalContinuity: 0.9,
    geographicContinuity: 0.2,
    entityTypeDiversity: 1,
    motifAffinity: 0.1,
    visualizability: 0.8,
    documentedRelation: 1,
    surprise: 0.4,
    articleQuality: 0.6,
    repetitionPenalty: 0,
  };

  it("weights drive the score: emphasizing a criterion raises reliance on its feature", () => {
    const temporalHeavy = scoreCandidate(baseFeatures, {
      ...zeroWeights,
      temporalContinuity: 5,
    });
    const geoHeavy = scoreCandidate(baseFeatures, {
      ...zeroWeights,
      geographicContinuity: 5,
    });
    expect(temporalHeavy.score).toBeCloseTo(0.9, 5);
    expect(geoHeavy.score).toBeCloseTo(0.2, 5);
    expect(temporalHeavy.contributions[0].criterion).toBe("temporalContinuity");
  });

  it("falls back to uniform weighting when all mapped weights are zero", () => {
    const breakdown = scoreCandidate(baseFeatures, zeroWeights);
    expect(breakdown.score).toBeGreaterThan(0);
    expect(breakdown.contributions.length).toBeGreaterThan(0);
  });

  it("subtracts the repetition penalty from the weighted sum", () => {
    const clean = scoreCandidate(baseFeatures, { ...zeroWeights, temporalContinuity: 5 });
    const repetitive = scoreCandidate(
      { ...baseFeatures, repetitionPenalty: 1 },
      { ...zeroWeights, temporalContinuity: 5 },
    );
    expect(repetitive.score).toBeCloseTo(clean.score - 0.5, 5);
  });
});

describe("path scoring", () => {
  it("bounds every path metric to [0, 1] and penalizes redundancy", () => {
    const repetitiveNodes = Array.from({ length: 5 }, (_, i) => ({
      features: {
        semanticSimilarity: 0.9, semanticDistance: 0.1, temporalContinuity: 0.9,
        geographicContinuity: 0.9, entityTypeDiversity: 0.2, motifAffinity: 0.5,
        visualizability: 0.3, documentedRelation: 0, surprise: 0.1,
        articleQuality: 0.5, repetitionPenalty: 0.8,
      } satisfies CandidateFeatures,
      facts: facts({ qid: `Q${i}`, instanceOfLabels: ["human"] }),
    }));
    const score = scorePath(repetitiveNodes);
    for (const [key, value] of Object.entries(score)) {
      expect(value, key).toBeGreaterThanOrEqual(0);
      expect(value, key).toBeLessThanOrEqual(1);
    }
    expect(score.redundancyPenalty).toBeGreaterThan(0.5);
    expect(score.entityDiversity).toBeLessThanOrEqual(0.2);
  });
});
