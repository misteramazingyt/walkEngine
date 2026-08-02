import type { SeededRng } from "./prng";
import { infoExclusionReason, titleExclusionReason } from "./exclusions";
import {
  RequestBudgetExhaustedError,
  type CandidateRecord,
  type VisitedNode,
  type WalkEngineConfig,
  type WalkGateway,
  type WalkProgress,
  type WalkResult,
} from "./types";

// The random walk. Deterministic for a given (seed, start title, gateway
// responses): candidate pools are seeded samples, choices are seeded picks,
// and link lists are sorted before sampling. A walk discovers ADJACENCY
// only — nothing here may be interpreted as historical warrant.

const INFO_BATCH_SIZE = 20; // MediaWiki extracts allow at most 20 pages/request

async function fetchInfos(
  gateway: WalkGateway,
  titles: string[],
): Promise<Map<string, import("./types").ArticleInfo>> {
  const result = new Map<string, import("./types").ArticleInfo>();
  for (let i = 0; i < titles.length; i += INFO_BATCH_SIZE) {
    const chunk = titles.slice(i, i + INFO_BATCH_SIZE);
    const infos = await gateway.getArticleInfos(chunk);
    for (const [title, info] of infos) result.set(title, info);
  }
  return result;
}

export async function runRandomWalk(options: {
  gateway: WalkGateway;
  rng: SeededRng;
  config: WalkEngineConfig;
  startTitle: string;
  onProgress?: (progress: WalkProgress) => void | Promise<void>;
}): Promise<WalkResult> {
  const { gateway, rng, config, startTitle, onProgress } = options;

  const visited: VisitedNode[] = [];
  const visitedTitles = new Set<string>();

  const report = async (currentTitle: string) => {
    await onProgress?.({
      visitedCount: visited.length,
      targetLength: config.walkLength,
      requestsUsed: gateway.requestsUsed(),
      currentTitle,
    });
  };

  const visit = async (
    title: string,
    chosenFrom: CandidateRecord[],
    knownInfo?: import("./types").ArticleInfo,
  ): Promise<VisitedNode> => {
    const info =
      knownInfo ?? (await fetchInfos(gateway, [title])).get(title);
    if (!info || info.missing) {
      throw new Error(`Article not found: "${title}"`);
    }
    const categories = await gateway.getCategories(info.title);
    const node: VisitedNode = {
      info,
      categories,
      visitIndex: visited.length,
      chosenFrom,
    };
    visited.push(node);
    visitedTitles.add(info.title);
    await report(info.title);
    return node;
  };

  try {
    let current = await visit(startTitle, []);

    while (visited.length < config.walkLength) {
      const linkTitles = await gateway.getOutgoingLinkTitles(current.info.title);

      // Title-level filtering is free; do it before sampling so the pool is
      // not wasted on obvious exclusions.
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
          requestsUsed: gateway.requestsUsed(),
        };
      }

      // Seeded sample of the candidate pool, then metadata-level exclusion.
      const pool = rng.sample(viable, config.branchFactor);
      const infos = await fetchInfos(gateway, pool);

      const candidates: CandidateRecord[] = pool.map((title) => {
        const info = infos.get(title);
        const reason = info
          ? infoExclusionReason(info, config)
          : "no metadata returned";
        return reason
          ? { title, eligible: false, exclusionReason: reason }
          : { title, eligible: true };
      });

      const eligible = candidates.filter((c) => c.eligible);
      if (eligible.length === 0) {
        return {
          visited,
          endReason: "NO_ELIGIBLE_CANDIDATES",
          requestsUsed: gateway.requestsUsed(),
        };
      }

      const chosen = rng.pick(eligible);
      // Record the full pool (with a sample of title-level exclusions for
      // the inspector) against the node being visited.
      const poolRecord = [...candidates, ...titleFiltered.slice(0, 30)];
      current = await visit(chosen.title, poolRecord, infos.get(chosen.title));
    }

    return {
      visited,
      endReason: "TARGET_LENGTH_REACHED",
      requestsUsed: gateway.requestsUsed(),
    };
  } catch (error) {
    if (error instanceof RequestBudgetExhaustedError) {
      return {
        visited,
        endReason: "REQUEST_BUDGET_EXHAUSTED",
        requestsUsed: gateway.requestsUsed(),
      };
    }
    throw error;
  }
}
