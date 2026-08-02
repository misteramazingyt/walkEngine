import type { Criterion } from "@/domain/enums";
import type { ArticleInfo, EntityFacts } from "./types";

// Deterministic candidate feature extraction and scoring. Every feature is
// normalized to [0, 1]. No LLM is involved here: criteria that require
// historical judgment (material dependency, conceptual inheritance, …)
// participate only through the optional LLM rerank stage, never through
// these formulas — pretending otherwise would manufacture warrant.

export interface CandidateFeatures {
  semanticSimilarity: number;
  semanticDistance: number;
  temporalContinuity: number;
  geographicContinuity: number;
  entityTypeDiversity: number;
  motifAffinity: number;
  visualizability: number;
  documentedRelation: number;
  surprise: number;
  articleQuality: number;
  repetitionPenalty: number;
}

export type FeatureKey = keyof CandidateFeatures;

/**
 * Which user criteria drive which deterministic feature. Criteria absent
 * here are LLM-rerank-only and contribute nothing deterministically.
 */
export const CRITERION_FEATURE_MAP: Partial<Record<Criterion, FeatureKey>> = {
  documentedInfluence: "documentedRelation",
  temporalContinuity: "temporalContinuity",
  geographicContinuity: "geographicContinuity",
  motifAffinity: "motifAffinity",
  semanticSimilarity: "semanticSimilarity",
  semanticDistance: "semanticDistance",
  visualizability: "visualizability",
  surprise: "surprise",
  evidentiaryStrength: "articleQuality",
};

export const LLM_ONLY_CRITERIA: Criterion[] = [
  "materialDependency",
  "institutionalContinuity",
  "conceptualInheritance",
  "sharedSocialFunction",
  "rhetoricalRecurrence",
  "commonProblem",
  "unintendedConsequence",
];

const STOPWORDS = new Set(
  "the a an and or of to in on for with by from as is are was were be been at it its this that which whose their his her they them there here also such into over under between".split(
    " ",
  ),
);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function eraMidpoint(facts?: EntityFacts): number | undefined {
  if (!facts) return undefined;
  if (facts.eraStart !== undefined && facts.eraEnd !== undefined) {
    return (facts.eraStart + facts.eraEnd) / 2;
  }
  return facts.eraStart ?? facts.eraEnd;
}

const CONCRETE_TYPE_HINTS = [
  "tool", "instrument", "building", "city", "document", "book", "machine",
  "ship", "artifact", "device", "alloy", "element", "route", "kingdom",
  "facility", "structure", "monument", "object", "detector",
];

function typeConcreteness(labels: string[]): number {
  const joined = labels.join(" ").toLowerCase();
  return CONCRETE_TYPE_HINTS.some((hint) => joined.includes(hint)) ? 1 : 0;
}

function isHuman(labels: string[]): boolean {
  return labels.some((l) => l.toLowerCase() === "human");
}

/** Aggregates over the path walked so far, updated after each visit. */
export interface PathAggregate {
  typesSeen: Set<string>;
  centuriesSeen: Map<number, number>;
  categoryBag: Set<string>;
  lastCoord?: { lat: number; lon: number };
  humanCount: number;
  nodeCount: number;
}

export function emptyPathAggregate(): PathAggregate {
  return {
    typesSeen: new Set(),
    centuriesSeen: new Map(),
    categoryBag: new Set(),
    humanCount: 0,
    nodeCount: 0,
  };
}

export function updatePathAggregate(
  aggregate: PathAggregate,
  node: { categories: string[]; facts?: EntityFacts },
): void {
  aggregate.nodeCount += 1;
  for (const category of node.categories) {
    aggregate.categoryBag.add(category.toLowerCase());
  }
  const facts = node.facts;
  if (facts) {
    for (const type of facts.instanceOfLabels) {
      aggregate.typesSeen.add(type.toLowerCase());
    }
    if (isHuman(facts.instanceOfLabels)) aggregate.humanCount += 1;
    const mid = eraMidpoint(facts);
    if (mid !== undefined) {
      const century = Math.floor(mid / 100);
      aggregate.centuriesSeen.set(
        century,
        (aggregate.centuriesSeen.get(century) ?? 0) + 1,
      );
    }
    if (facts.coord) aggregate.lastCoord = facts.coord;
  }
}

export function computeCandidateFeatures(options: {
  candidate: ArticleInfo;
  candidateFacts?: EntityFacts;
  current: ArticleInfo;
  currentFacts?: EntityFacts;
  candidateCategories?: string[];
  path: PathAggregate;
  pathDescription: string;
}): CandidateFeatures {
  const {
    candidate, candidateFacts, current, currentFacts,
    candidateCategories = [], path, pathDescription,
  } = options;

  const candidateTokens = tokens(
    `${candidate.title} ${candidate.summary} ${candidateCategories.join(" ")}`,
  );
  const currentTokens = tokens(`${current.title} ${current.summary}`);

  // Jaccard between short texts is small even for related pages; scale up.
  const semanticSimilarity = clamp01(jaccard(candidateTokens, currentTokens) * 4);
  const semanticDistance = 1 - semanticSimilarity;

  const candidateMid = eraMidpoint(candidateFacts);
  const currentMid = eraMidpoint(currentFacts);
  const temporalContinuity =
    candidateMid !== undefined && currentMid !== undefined
      ? clamp01(Math.exp(-Math.abs(candidateMid - currentMid) / 200))
      : 0.5; // unknown → neutral, never a punishment for missing data

  const candidateCoord = candidateFacts?.coord;
  const referenceCoord = currentFacts?.coord ?? path.lastCoord;
  const geographicContinuity =
    candidateCoord && referenceCoord
      ? clamp01(Math.exp(-haversineKm(candidateCoord, referenceCoord) / 1500))
      : 0.5;

  const candidateTypes = (candidateFacts?.instanceOfLabels ?? []).map((t) =>
    t.toLowerCase(),
  );
  const entityTypeDiversity =
    candidateTypes.length === 0
      ? 0.5
      : candidateTypes.some((t) => !path.typesSeen.has(t))
        ? 1
        : 0.2;

  const descriptionTokens = tokens(pathDescription);
  const motifAffinity =
    descriptionTokens.size === 0
      ? 0.5
      : clamp01(
          [...descriptionTokens].filter((t) => candidateTokens.has(t)).length / 4,
        );

  const visualizability = clamp01(
    0.6 * typeConcreteness(candidateFacts?.instanceOfLabels ?? []) +
      0.4 * (candidate.length > 5000 ? 1 : candidate.length / 5000),
  );

  const documentedRelation =
    candidateFacts && currentFacts
      ? currentFacts.claimTargetQids.includes(candidateFacts.qid) ||
        candidateFacts.claimTargetQids.includes(currentFacts.qid)
        ? 1
        : 0
      : 0;

  const candidateCategorySet = new Set(
    candidateCategories.map((c) => c.toLowerCase()),
  );
  let categoryOverlap = 0;
  for (const c of candidateCategorySet) {
    if (path.categoryBag.has(c)) categoryOverlap++;
  }
  const surprise =
    candidateCategorySet.size === 0
      ? 0.5
      : clamp01(1 - (categoryOverlap / candidateCategorySet.size));

  const articleQuality = clamp01(
    0.6 * Math.min(1, Math.log10(Math.max(candidate.length, 1)) / 5) +
      0.4 * Math.min(1, (candidateFacts?.sitelinks ?? 0) / 100),
  );

  // Repetition penalty components: repeating an entity type, piling into an
  // already-crowded century, and extending a biography-heavy path.
  let penalty = 0;
  if (
    candidateTypes.length > 0 &&
    candidateTypes.every((t) => path.typesSeen.has(t))
  ) {
    penalty += 0.4;
  }
  if (candidateMid !== undefined) {
    const century = Math.floor(candidateMid / 100);
    if ((path.centuriesSeen.get(century) ?? 0) >= 2) penalty += 0.3;
  }
  if (
    isHuman(candidateFacts?.instanceOfLabels ?? []) &&
    path.nodeCount > 0 &&
    path.humanCount / path.nodeCount >= 0.4
  ) {
    penalty += 0.3;
  }
  const repetitionPenalty = clamp01(penalty);

  return {
    semanticSimilarity,
    semanticDistance,
    temporalContinuity,
    geographicContinuity,
    entityTypeDiversity,
    motifAffinity,
    visualizability,
    documentedRelation,
    surprise,
    articleQuality,
    repetitionPenalty,
  };
}

export interface ScoreBreakdown {
  score: number;
  contributions: Array<{
    criterion: string;
    feature: FeatureKey;
    weight: number;
    value: number;
    contribution: number;
  }>;
  repetitionPenalty: number;
}

/**
 * S(c) = Σ w_k · f_k(c) − λ·R(c), with user weights normalized to sum 1.
 * If every mapped weight is zero, deterministic features are weighted
 * uniformly so criteriological mode still ranks rather than degenerating.
 */
export function scoreCandidate(
  features: CandidateFeatures,
  criteriaWeights: Record<Criterion, number>,
): ScoreBreakdown {
  const active = Object.entries(CRITERION_FEATURE_MAP) as Array<
    [Criterion, FeatureKey]
  >;
  let totalWeight = active.reduce(
    (sum, [criterion]) => sum + (criteriaWeights[criterion] ?? 0),
    0,
  );
  const uniform = totalWeight === 0;
  if (uniform) totalWeight = active.length;

  const contributions = active.map(([criterion, feature]) => {
    const rawWeight = uniform ? 1 : (criteriaWeights[criterion] ?? 0);
    const weight = rawWeight / totalWeight;
    const value = features[feature];
    return {
      criterion,
      feature,
      weight: rawWeight,
      value,
      contribution: weight * value,
    };
  });

  const positive = contributions.reduce((sum, c) => sum + c.contribution, 0);
  const score = positive - features.repetitionPenalty * 0.5;

  return {
    score,
    contributions: contributions
      .filter((c) => c.weight > 0)
      .sort((a, b) => b.contribution - a.contribution),
    repetitionPenalty: features.repetitionPenalty,
  };
}

export function explainChoice(breakdown: ScoreBreakdown): string[] {
  const lines = breakdown.contributions
    .slice(0, 3)
    .map(
      (c) =>
        `${c.criterion}: ${c.value.toFixed(2)} × weight ${c.weight.toFixed(1)}`,
    );
  if (breakdown.repetitionPenalty > 0) {
    lines.push(`repetition penalty −${(breakdown.repetitionPenalty * 0.5).toFixed(2)}`);
  }
  return lines;
}

/** Path-level score, per the spec's PathScore interface. */
export interface PathScore {
  warrant: number;
  novelty: number;
  entityDiversity: number;
  edgeTypeDiversity: number;
  motifDevelopment: number;
  concreteCarrierDensity: number;
  endpointStrength: number;
  visualizability: number;
  redundancyPenalty: number;
}

export function scorePath(
  nodes: Array<{ features?: CandidateFeatures; facts?: EntityFacts }>,
): PathScore {
  const scored = nodes.filter(
    (n): n is { features: CandidateFeatures; facts?: EntityFacts } =>
      n.features !== undefined,
  );
  const avg = (pick: (f: CandidateFeatures) => number): number =>
    scored.length === 0
      ? 0
      : scored.reduce((sum, n) => sum + pick(n.features), 0) / scored.length;

  const allTypes = nodes.flatMap((n) =>
    (n.facts?.instanceOfLabels ?? []).map((t) => t.toLowerCase()),
  );
  const entityDiversity =
    allTypes.length === 0 ? 0 : new Set(allTypes).size / allTypes.length;

  // Which feature dominated each hop — a proxy for transition variety until
  // Phase 4 assigns real edge types.
  const dominant = scored.map((n) => {
    const f = n.features;
    const entries = Object.entries(f) as Array<[FeatureKey, number]>;
    return entries
      .filter(([k]) => k !== "repetitionPenalty" && k !== "semanticDistance")
      .sort((a, b) => b[1] - a[1])[0][0];
  });
  const edgeTypeDiversity =
    dominant.length === 0 ? 0 : new Set(dominant).size / dominant.length;

  const last = nodes[nodes.length - 1];
  const endpointStrength =
    last?.features !== undefined
      ? (last.features.articleQuality + last.features.visualizability) / 2
      : 0;

  return {
    warrant: avg((f) => f.documentedRelation),
    novelty: avg((f) => f.surprise),
    entityDiversity,
    edgeTypeDiversity,
    motifDevelopment: avg((f) => f.motifAffinity),
    concreteCarrierDensity: avg((f) => f.visualizability),
    endpointStrength,
    visualizability: avg((f) => f.visualizability),
    redundancyPenalty: avg((f) => f.repetitionPenalty),
  };
}
