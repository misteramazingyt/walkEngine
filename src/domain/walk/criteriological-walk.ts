import type { Criterion } from "@/domain/enums";
import type { SeededRng } from "./prng";
import { infoExclusionReason, titleExclusionReason } from "./exclusions";
import {
  computeCandidateFeatures,
  emptyPathAggregate,
  explainChoice,
  scoreCandidate,
  updatePathAggregate,
  type CandidateFeatures,
  type PathAggregate,
} from "./features";
import {
  RequestBudgetExhaustedError,
  type ArticleInfo,
  type CandidateRecord,
  type EntityFacts,
  type EntityFactsGateway,
  type WalkEndReason,
  type WalkEngineConfig,
  type WalkGateway,
  type WalkProgress,
} from "./types";

// The criteriological walk: candidates are enriched (Wikipedia info +
// Wikidata facts), scored deterministically against the user's weights, and
// selected by the configured sampling mode. Deterministic for a given
// (seed, start, gateway responses, configuration) — the LLM is never
// consulted here; optional reranking is a separate, later concern.

export interface CriteriologicalConfig extends WalkEngineConfig {
  criteriaWeights: Record<Criterion, number>;
  pathDescription: string;
  samplingMode: "GREEDY" | "WEIGHTED" | "EXPLORATORY" | "BEAM";
  temporalBounds: { start: number | null; end: number | null };
  maxPopularityPercentile: number;
}

export interface EnrichedVisitedNode {
  info: ArticleInfo;
  categories: string[];
  facts?: EntityFacts;
  features?: CandidateFeatures;
  score?: number;
  why?: string[];
  visitIndex: number;
  chosenFrom: CandidateRecord[];
}

export interface CriteriologicalWalkResult {
  visited: EnrichedVisitedNode[];
  endReason: WalkEndReason;
  requestsUsed: number;
}

const INFO_BATCH_SIZE = 20;

/** Sitelink-count → rough popularity percentile (documented approximation). */
export function approximatePopularityPercentile(sitelinks: number): number {
  return Math.min(1, sitelinks / 300) * 100;
}

function boundsExclusionReason(
  facts: EntityFacts | undefined,
  config: CriteriologicalConfig,
): string | null {
  if (facts) {
    const { start, end } = config.temporalBounds;
    if (start !== null || end !== null) {
      const eraStart = facts.eraStart;
      const eraEnd = facts.eraEnd ?? facts.eraStart;
      // Only exclude on POSITIVE evidence of being out of bounds; unknown
      // eras stay eligible rather than being silently filtered.
      if (eraStart !== undefined && eraEnd !== undefined) {
        if (end !== null && eraStart > end) return "after temporal bounds";
        if (start !== null && eraEnd < start) return "before temporal bounds";
      }
    }
    if (config.maxPopularityPercentile < 100) {
      const pct = approximatePopularityPercentile(facts.sitelinks);
      if (pct > config.maxPopularityPercentile) {
        return `popularity ~p${Math.round(pct)} exceeds cap (sitelink proxy)`;
      }
    }
  }
  return null;
}

function softmaxSample(
  rng: SeededRng,
  scored: Array<{ score: number }>,
  temperature: number,
): number {
  const max = Math.max(...scored.map((s) => s.score));
  const weights = scored.map((s) => Math.exp((s.score - max) / temperature));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

export async function runCriteriologicalWalk(options: {
  wikipedia: WalkGateway;
  entityFacts: EntityFactsGateway;
  rng: SeededRng;
  config: CriteriologicalConfig;
  startTitle: string;
  onProgress?: (progress: WalkProgress) => void | Promise<void>;
}): Promise<CriteriologicalWalkResult> {
  const { wikipedia, entityFacts, rng, config, startTitle, onProgress } = options;

  if (config.samplingMode === "BEAM") {
    // Interface reserved; see beam.ts. Refuse loudly rather than degrade.
    throw new Error("Beam search is feature-flagged off in this build");
  }

  const visited: EnrichedVisitedNode[] = [];
  const visitedTitles = new Set<string>();
  const aggregate: PathAggregate = emptyPathAggregate();

  const fetchInfos = async (titles: string[]) => {
    const result = new Map<string, ArticleInfo>();
    for (let i = 0; i < titles.length; i += INFO_BATCH_SIZE) {
      const infos = await wikipedia.getArticleInfos(
        titles.slice(i, i + INFO_BATCH_SIZE),
      );
      for (const [t, info] of infos) result.set(t, info);
    }
    return result;
  };

  const fetchFacts = async (
    infos: Map<string, ArticleInfo>,
  ): Promise<Map<string, EntityFacts>> => {
    const qids = [...infos.values()]
      .map((i) => i.wikidataId)
      .filter((q): q is string => q !== undefined);
    if (qids.length === 0) return new Map();
    return entityFacts.getEntityFacts(qids);
  };

  const report = async (title: string) => {
    await onProgress?.({
      visitedCount: visited.length,
      targetLength: config.walkLength,
      requestsUsed: wikipedia.requestsUsed(),
      currentTitle: title,
    });
  };

  const visit = async (node: Omit<EnrichedVisitedNode, "visitIndex">) => {
    const complete: EnrichedVisitedNode = { ...node, visitIndex: visited.length };
    visited.push(complete);
    visitedTitles.add(node.info.title);
    updatePathAggregate(aggregate, {
      categories: node.categories,
      facts: node.facts,
    });
    await report(node.info.title);
    return complete;
  };

  try {
    // Start node: enrich but do not score (it was chosen by the user).
    const startInfos = await fetchInfos([startTitle]);
    const startInfo = startInfos.get(startTitle);
    if (!startInfo || startInfo.missing) {
      throw new Error(`Article not found: "${startTitle}"`);
    }
    const startFactsMap = await fetchFacts(startInfos);
    const startFacts = startInfo.wikidataId
      ? startFactsMap.get(startInfo.wikidataId)
      : undefined;
    let current = await visit({
      info: startInfo,
      categories: await wikipedia.getCategories(startInfo.title),
      facts: startFacts,
      chosenFrom: [],
    });

    while (visited.length < config.walkLength) {
      const linkTitles = await wikipedia.getOutgoingLinkTitles(current.info.title);

      const titleFiltered: CandidateRecord[] = [];
      const viable: string[] = [];
      for (const title of [...linkTitles].sort()) {
        const reason = titleExclusionReason(title, config);
        if (reason) {
          titleFiltered.push({ title, eligible: false, exclusionReason: reason });
        } else if (!config.allowRevisits && visitedTitles.has(title)) {
          titleFiltered.push({
            title,
            eligible: false,
            exclusionReason: "already visited",
          });
        } else {
          viable.push(title);
        }
      }
      if (viable.length === 0) {
        return {
          visited,
          endReason: "NO_ELIGIBLE_CANDIDATES",
          requestsUsed: wikipedia.requestsUsed(),
        };
      }

      const pool = rng.sample(viable, config.branchFactor);
      const infos = await fetchInfos(pool);
      const factsMap = await fetchFacts(infos);

      const candidates: CandidateRecord[] = pool.map((title) => {
        const info = infos.get(title);
        if (!info) {
          return { title, eligible: false, exclusionReason: "no metadata returned" };
        }
        const infoReason = infoExclusionReason(info, config);
        if (infoReason) {
          return { title, eligible: false, exclusionReason: infoReason };
        }
        const facts = info.wikidataId ? factsMap.get(info.wikidataId) : undefined;
        const boundsReason = boundsExclusionReason(facts, config);
        if (boundsReason) {
          return { title, eligible: false, exclusionReason: boundsReason };
        }
        const features = computeCandidateFeatures({
          candidate: info,
          candidateFacts: facts,
          current: current.info,
          currentFacts: current.facts,
          path: aggregate,
          pathDescription: config.pathDescription,
        });
        const breakdown = scoreCandidate(features, config.criteriaWeights);
        return {
          title: info.title,
          eligible: true,
          features,
          score: breakdown.score,
          why: explainChoice(breakdown),
        };
      });

      const eligible = candidates
        .filter((c) => c.eligible && c.score !== undefined)
        .sort((a, b) => a.title.localeCompare(b.title)); // stable order pre-sampling
      if (eligible.length === 0) {
        return {
          visited,
          endReason: "NO_ELIGIBLE_CANDIDATES",
          requestsUsed: wikipedia.requestsUsed(),
        };
      }

      let chosenIndex: number;
      if (config.samplingMode === "GREEDY") {
        chosenIndex = eligible.reduce(
          (best, c, i) => ((c.score ?? 0) > (eligible[best].score ?? 0) ? i : best),
          0,
        );
      } else if (config.samplingMode === "WEIGHTED") {
        const min = Math.min(...eligible.map((c) => c.score ?? 0));
        const weights = eligible.map((c) => (c.score ?? 0) - min + 0.05);
        const total = weights.reduce((a, b) => a + b, 0);
        let r = rng.next() * total;
        chosenIndex = weights.length - 1;
        for (let i = 0; i < weights.length; i++) {
          r -= weights[i];
          if (r <= 0) {
            chosenIndex = i;
            break;
          }
        }
      } else {
        chosenIndex = softmaxSample(
          rng,
          eligible.map((c) => ({ score: c.score ?? 0 })),
          0.25,
        );
      }

      const chosen = eligible[chosenIndex];
      const chosenInfo = infos.get(chosen.title);
      if (!chosenInfo) throw new Error(`Lost info for chosen "${chosen.title}"`);
      const chosenFacts = chosenInfo.wikidataId
        ? factsMap.get(chosenInfo.wikidataId)
        : undefined;

      current = await visit({
        info: chosenInfo,
        categories: await wikipedia.getCategories(chosenInfo.title),
        facts: chosenFacts,
        features: chosen.features,
        score: chosen.score,
        why: chosen.why,
        chosenFrom: [...candidates, ...titleFiltered.slice(0, 30)],
      });
    }

    return {
      visited,
      endReason: "TARGET_LENGTH_REACHED",
      requestsUsed: wikipedia.requestsUsed(),
    };
  } catch (error) {
    if (error instanceof RequestBudgetExhaustedError) {
      return {
        visited,
        endReason: "REQUEST_BUDGET_EXHAUSTED",
        requestsUsed: wikipedia.requestsUsed(),
      };
    }
    throw error;
  }
}
