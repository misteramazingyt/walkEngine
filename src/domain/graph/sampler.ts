import type { SeededRng } from "@/domain/walk/prng";
import { titleExclusionReason } from "@/domain/walk/exclusions";
import type {
  ArticleInfo,
  EntityFacts,
  EntityFactsGateway,
  WalkGateway,
} from "@/domain/walk/types";
import {
  RELATION_WEIGHTS,
  type ArchiveEdge,
  type ArchiveNode,
  type SampledArchive,
  type WalkPolicy,
  type WalkEpisode,
} from "./types";

// Stochastic archive sampling. The purpose is NOT to narrate the random
// path — it is to sample enough of the local archive that concentrations
// become detectable. Randomness supplies variation; the archive supplies
// bounds; the deficiency (when one is selected) supplies direction.
//
// Reproducibility is a requirement: every choice draws from the seeded rng,
// so the same seed and configuration resample the same archive.

export interface SamplingConfig {
  policyMix: Record<WalkPolicy, number>;
  episodes: number;
  hopsPerEpisode: number;
  restartProbability: number;
  /** Terms biasing attention-conditioned policies. */
  attentionTerms: string[];
  /** Terms from the currently selected explanatory deficiency. */
  deficiencyTerms: string[];
  maxNodes: number;
  maxEdges: number;
  minArticleLength: number;
  excludeMetaPages: boolean;
  /** Expand second-order outlinks for the top-K level-1 pages only. */
  secondOrderFanout: number;
  /** Keep an L2 node only if it links to at least this many L1 nodes. */
  sharedNeighborThreshold: number;
}

const SUMMARY_LIMIT = 600;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
}

function termOverlap(text: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  const tokens = tokenize(text);
  const termTokens = new Set(terms.flatMap((t) => [...tokenize(t)]));
  let hits = 0;
  for (const t of termTokens) if (tokens.has(t)) hits += 1;
  return Math.min(1, hits / 3);
}

/** Draw a policy from the mixture using the seeded rng. */
function drawPolicy(rng: SeededRng, mix: Record<WalkPolicy, number>): WalkPolicy {
  const entries = Object.entries(mix) as Array<[WalkPolicy, number]>;
  const total = entries.reduce((sum, [, w]) => sum + w, 0) || 1;
  let r = rng.next() * total;
  for (const [policy, weight] of entries) {
    r -= weight;
    if (r <= 0) return policy;
  }
  return entries[entries.length - 1][0];
}

export async function sampleArchive(options: {
  wikipedia: WalkGateway;
  entityFacts?: EntityFactsGateway;
  rng: SeededRng;
  config: SamplingConfig;
  /** Where sampling begins — the seed region or the current subject region. */
  originTitles: string[];
  /** Titles already accepted as subjects; sampled but never re-proposed. */
  visitedSubjects: Set<string>;
  onProgress?: (message: string) => void | Promise<void>;
}): Promise<SampledArchive> {
  const { wikipedia, entityFacts, rng, config, originTitles } = options;

  const nodes = new Map<string, ArchiveNode>();
  const edges: ArchiveEdge[] = [];
  const episodes: WalkEpisode[] = [];
  const rejected: Array<{ title: string; reason: string }> = [];
  const linkCache = new Map<string, string[]>();
  let novelInLastEpisodes = 0;
  let visitsInLastEpisodes = 0;

  const eligible = (title: string): string | null => {
    const reason = titleExclusionReason(title, config);
    if (reason) return reason;
    return null;
  };

  const getLinks = async (title: string): Promise<string[]> => {
    const cached = linkCache.get(title);
    if (cached) return cached;
    const links = await wikipedia.getOutgoingLinkTitles(title);
    const viable = links.filter((t) => {
      const reason = eligible(t);
      if (reason) {
        if (rejected.length < 200) rejected.push({ title: t, reason });
        return false;
      }
      return true;
    });
    linkCache.set(title, viable);
    return viable;
  };

  const addNode = (info: ArticleInfo, level: number, episodeId: string) => {
    const existing = nodes.get(info.title);
    if (existing) {
      if (!existing.episodeIds.includes(episodeId)) {
        existing.episodeIds.push(episodeId);
      }
      existing.level = Math.min(existing.level, level);
      return false;
    }
    if (nodes.size >= config.maxNodes) return false;
    nodes.set(info.title, {
      id: info.title,
      title: info.title,
      url: info.url,
      summary: info.summary.slice(0, SUMMARY_LIMIT),
      length: info.length,
      wikidataId: info.wikidataId,
      categories: [],
      entityTypes: [],
      level,
      episodeIds: [episodeId],
    });
    return true;
  };

  const addEdge = (
    sourceId: string,
    targetId: string,
    relationType: ArchiveEdge["relationType"],
    provenance: string,
  ) => {
    if (edges.length >= config.maxEdges) return;
    if (sourceId === targetId) return;
    edges.push({
      sourceId,
      targetId,
      relationType,
      weight: RELATION_WEIGHTS[relationType],
      provenance,
    });
  };

  const fetchInfos = async (titles: string[]): Promise<Map<string, ArticleInfo>> => {
    const result = new Map<string, ArticleInfo>();
    for (let i = 0; i < titles.length; i += 20) {
      const batch = await wikipedia.getArticleInfos(titles.slice(i, i + 20));
      for (const [t, info] of batch) result.set(t, info);
    }
    return result;
  };

  const usable = (info: ArticleInfo | undefined): info is ArticleInfo =>
    !!info &&
    !info.missing &&
    !info.isDisambiguation &&
    info.summary.length > 0 &&
    info.length >= config.minArticleLength;

  // ---- Level 0: the origin region -----------------------------------------
  const originInfos = await fetchInfos(originTitles);
  for (const title of originTitles) {
    const info = originInfos.get(title);
    if (usable(info)) addNode(info, 0, "origin");
  }
  if (nodes.size === 0) {
    return {
      nodes,
      edges,
      episodes,
      rejected,
      requestsUsed: wikipedia.requestsUsed(),
      noveltyRate: 0,
      revisitRate: 0,
    };
  }

  // ---- Stochastic walk episodes -------------------------------------------
  for (let e = 0; e < config.episodes; e++) {
    if (nodes.size >= config.maxNodes) break;
    const policy = drawPolicy(
      rng,
      config.deficiencyTerms.length > 0
        ? config.policyMix
        : config.policyMix,
    );
    const episodeId = `ep${e + 1}`;
    const start =
      policy === "surprise_jump" && nodes.size > 1
        ? rng.pick([...nodes.keys()])
        : rng.pick(originTitles.filter((t) => nodes.has(t)) ?? originTitles);

    const episode: WalkEpisode = {
      id: episodeId,
      policy,
      startTitle: start,
      path: [start],
      hops: 0,
      restarted: false,
      novelNodes: 0,
    };

    let current = start;
    let previous: string | null = null;

    for (let hop = 0; hop < config.hopsPerEpisode; hop++) {
      if (nodes.size >= config.maxNodes) break;

      if (hop > 0 && rng.next() < config.restartProbability) {
        current = rng.pick(originTitles.filter((t) => nodes.has(t)) ?? [start]);
        previous = null;
        episode.restarted = true;
        episode.path.push(`↻${current}`);
        continue;
      }

      const links = await getLinks(current);
      if (links.length === 0) break;

      // Candidate slate for this hop, bounded so metadata cost stays sane.
      let slate = rng.sample(links, Math.min(12, links.length));
      if (policy === "non_backtracking" && previous) {
        const filtered = slate.filter((t) => t !== previous);
        if (filtered.length > 0) slate = filtered;
      }

      const infos = await fetchInfos(slate);
      const usableSlate = slate.filter((t) => usable(infos.get(t)));
      if (usableSlate.length === 0) break;

      // Policy determines the sampling distribution over the slate.
      let chosen: string;
      switch (policy) {
        case "novelty_biased": {
          const unseen = usableSlate.filter((t) => !nodes.has(t));
          chosen = rng.pick(unseen.length > 0 ? unseen : usableSlate);
          break;
        }
        case "attention_biased": {
          const scored = usableSlate.map((t) => ({
            title: t,
            score:
              termOverlap(
                `${t} ${infos.get(t)?.summary ?? ""}`,
                [...config.attentionTerms, ...config.deficiencyTerms],
              ) + 0.05,
          }));
          const total = scored.reduce((s, c) => s + c.score, 0);
          let r = rng.next() * total;
          chosen = scored[scored.length - 1].title;
          for (const c of scored) {
            r -= c.score;
            if (r <= 0) {
              chosen = c.title;
              break;
            }
          }
          break;
        }
        case "personalized_pagerank": {
          // Approximate: prefer pages already connected to the sampled graph,
          // which is where PPR mass concentrates.
          const connected = usableSlate.filter((t) => nodes.has(t));
          chosen = rng.pick(connected.length > 0 ? connected : usableSlate);
          break;
        }
        case "surprise_jump": {
          const distant = usableSlate.filter(
            (t) =>
              termOverlap(
                `${t} ${infos.get(t)?.summary ?? ""}`,
                config.attentionTerms,
              ) === 0,
          );
          chosen = rng.pick(distant.length > 0 ? distant : usableSlate);
          break;
        }
        default:
          chosen = rng.pick(usableSlate);
      }

      const info = infos.get(chosen)!;
      const isNew = addNode(info, current === start ? 1 : 2, episodeId);
      if (isNew) episode.novelNodes += 1;
      visitsInLastEpisodes += 1;
      if (isNew) novelInLastEpisodes += 1;

      if (nodes.has(current)) {
        addEdge(current, info.title, "outlink", `${current} links to ${info.title}`);
      }
      previous = current;
      current = info.title;
      episode.path.push(info.title);
      episode.hops += 1;
    }

    episodes.push(episode);

    // Stop early when novelty collapses — more sampling buys nothing.
    if (e >= 4 && episode.novelNodes === 0) break;
  }

  // ---- Second-order expansion, pruned --------------------------------------
  const levelOne = [...nodes.values()]
    .filter((n) => n.level <= 1)
    .sort((a, b) => b.length - a.length)
    .slice(0, config.secondOrderFanout)
    .map((n) => n.id);

  const secondOrderCounts = new Map<string, Set<string>>();
  for (const parent of levelOne) {
    if (nodes.size >= config.maxNodes) break;
    const links = await getLinks(parent);
    for (const link of links.slice(0, 60)) {
      if (!secondOrderCounts.has(link)) secondOrderCounts.set(link, new Set());
      secondOrderCounts.get(link)!.add(parent);
    }
  }

  // Retain an L2 node only when it links several L1 nodes: that is evidence
  // of a shared neighbourhood, which is what makes clusters detectable by
  // outlink structure rather than by lexical similarity.
  const retained = [...secondOrderCounts.entries()]
    .filter(([title, parents]) => {
      if (nodes.has(title)) return false;
      return parents.size >= config.sharedNeighborThreshold;
    })
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, Math.max(0, config.maxNodes - nodes.size))
    .map(([title]) => title);

  if (retained.length > 0) {
    const infos = await fetchInfos(retained);
    for (const title of retained) {
      const info = infos.get(title);
      if (!usable(info)) continue;
      addNode(info, 2, "second-order");
      for (const parent of secondOrderCounts.get(title) ?? []) {
        addEdge(parent, info.title, "outlink", `${parent} links to ${info.title}`);
      }
    }
  }

  // Shared-neighbor edges among level-1 pages that co-link the same targets.
  for (const [target, parents] of secondOrderCounts) {
    if (parents.size < 2) continue;
    const list = [...parents].sort();
    for (let i = 0; i < list.length && i < 8; i++) {
      for (let j = i + 1; j < list.length && j < 8; j++) {
        addEdge(
          list[i],
          list[j],
          "shared_neighbor",
          `both link to ${target}`,
        );
      }
    }
  }

  // Reciprocity: promote mutual links, the strongest cheap signal available.
  const linkSet = new Set(edges.map((e) => `${e.sourceId}→${e.targetId}`));
  for (const edge of [...edges]) {
    if (
      edge.relationType === "outlink" &&
      linkSet.has(`${edge.targetId}→${edge.sourceId}`)
    ) {
      edge.relationType = "reciprocal_link";
      edge.weight = RELATION_WEIGHTS.reciprocal_link;
    }
  }

  // ---- Wikidata enrichment for the retained nodes --------------------------
  if (entityFacts) {
    const qids = [...nodes.values()]
      .map((n) => n.wikidataId)
      .filter((q): q is string => !!q)
      .slice(0, 100);
    if (qids.length > 0) {
      let facts = new Map<string, EntityFacts>();
      try {
        facts = await entityFacts.getEntityFacts(qids);
      } catch {
        // Enrichment is advisory; a failure must not abort the sample.
      }
      const byQid = new Map<string, ArchiveNode>();
      for (const node of nodes.values()) {
        if (node.wikidataId) byQid.set(node.wikidataId, node);
      }
      for (const [qid, fact] of facts) {
        const node = byQid.get(qid);
        if (!node) continue;
        node.entityTypes = fact.instanceOfLabels;
        node.eraStart = fact.eraStart;
        node.eraEnd = fact.eraEnd;
        node.coord = fact.coord;
        node.sitelinks = fact.sitelinks;
        for (const targetQid of fact.claimTargetQids) {
          const target = byQid.get(targetQid);
          if (target) {
            addEdge(
              node.id,
              target.id,
              "wikidata_relation",
              `Wikidata claim ${qid} → ${targetQid}`,
            );
          }
        }
      }
    }
  }

  return {
    nodes,
    edges,
    episodes,
    rejected,
    requestsUsed: wikipedia.requestsUsed(),
    noveltyRate:
      visitsInLastEpisodes > 0 ? novelInLastEpisodes / visitsInLastEpisodes : 0,
    revisitRate:
      visitsInLastEpisodes > 0
        ? 1 - novelInLastEpisodes / visitsInLastEpisodes
        : 0,
  };
}
