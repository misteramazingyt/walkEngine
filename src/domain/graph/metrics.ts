import type { ArchiveEdge, GraphMetrics } from "./types";

// Graph statistics, hand-rolled so the semantics are explicit and the
// results reproducible. Personalized PageRank measures relevance to the
// current subject region; Brandes betweenness finds candidate bridges; the
// hub score exists to keep "linked by everything" from being mistaken for
// "connects two regions".

interface Adjacency {
  out: Map<string, Array<{ to: string; weight: number }>>;
  undirected: Map<string, Array<{ to: string; weight: number }>>;
  nodes: string[];
}

export function buildAdjacency(
  nodeIds: string[],
  edges: ArchiveEdge[],
): Adjacency {
  const out = new Map<string, Array<{ to: string; weight: number }>>();
  const undirected = new Map<string, Array<{ to: string; weight: number }>>();
  const present = new Set(nodeIds);
  for (const id of nodeIds) {
    out.set(id, []);
    undirected.set(id, []);
  }
  for (const edge of edges) {
    if (!present.has(edge.sourceId) || !present.has(edge.targetId)) continue;
    if (edge.sourceId === edge.targetId) continue;
    out.get(edge.sourceId)!.push({ to: edge.targetId, weight: edge.weight });
    undirected.get(edge.sourceId)!.push({ to: edge.targetId, weight: edge.weight });
    undirected.get(edge.targetId)!.push({ to: edge.sourceId, weight: edge.weight });
  }
  return { out, undirected, nodes: nodeIds };
}

/**
 * Personalized PageRank by power iteration. The restart distribution is the
 * seed set — usually the current subject region — so the score answers
 * "how strongly is this connected to where we are standing?"
 */
export function personalizedPageRank(
  adjacency: Adjacency,
  seeds: string[],
  options: { damping?: number; iterations?: number } = {},
): Map<string, number> {
  const damping = options.damping ?? 0.85;
  const iterations = options.iterations ?? 40;
  const nodes = adjacency.nodes;
  const n = nodes.length;
  if (n === 0) return new Map();

  const seedSet = seeds.filter((s) => adjacency.out.has(s));
  const restart = new Map<string, number>();
  if (seedSet.length > 0) {
    for (const s of seedSet) restart.set(s, 1 / seedSet.length);
  } else {
    for (const id of nodes) restart.set(id, 1 / n);
  }

  let rank = new Map<string, number>(nodes.map((id) => [id, restart.get(id) ?? 0]));

  for (let i = 0; i < iterations; i++) {
    const next = new Map<string, number>(nodes.map((id) => [id, 0]));
    let dangling = 0;
    for (const id of nodes) {
      const edges = adjacency.out.get(id) ?? [];
      const mass = rank.get(id) ?? 0;
      if (edges.length === 0) {
        dangling += mass;
        continue;
      }
      const total = edges.reduce((sum, e) => sum + e.weight, 0) || 1;
      for (const edge of edges) {
        next.set(
          edge.to,
          (next.get(edge.to) ?? 0) + (mass * edge.weight) / total,
        );
      }
    }
    for (const id of nodes) {
      const value =
        damping * ((next.get(id) ?? 0) + dangling * (restart.get(id) ?? 0)) +
        (1 - damping) * (restart.get(id) ?? 0);
      next.set(id, value);
    }
    const sum = [...next.values()].reduce((a, b) => a + b, 0) || 1;
    for (const id of nodes) next.set(id, (next.get(id) ?? 0) / sum);
    rank = next;
  }
  return rank;
}

/** Brandes betweenness on the undirected projection, unweighted BFS. */
export function betweenness(adjacency: Adjacency): Map<string, number> {
  const nodes = adjacency.nodes;
  const cb = new Map<string, number>(nodes.map((id) => [id, 0]));

  for (const source of nodes) {
    const stack: string[] = [];
    const predecessors = new Map<string, string[]>(nodes.map((id) => [id, []]));
    const sigma = new Map<string, number>(nodes.map((id) => [id, 0]));
    const distance = new Map<string, number>(nodes.map((id) => [id, -1]));
    sigma.set(source, 1);
    distance.set(source, 0);

    const queue: string[] = [source];
    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);
      for (const { to } of adjacency.undirected.get(v) ?? []) {
        if (distance.get(to) === -1) {
          distance.set(to, (distance.get(v) ?? 0) + 1);
          queue.push(to);
        }
        if (distance.get(to) === (distance.get(v) ?? 0) + 1) {
          sigma.set(to, (sigma.get(to) ?? 0) + (sigma.get(v) ?? 0));
          predecessors.get(to)!.push(v);
        }
      }
    }

    const delta = new Map<string, number>(nodes.map((id) => [id, 0]));
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of predecessors.get(w) ?? []) {
        const contribution =
          ((sigma.get(v) ?? 0) / (sigma.get(w) ?? 1)) * (1 + (delta.get(w) ?? 0));
        delta.set(v, (delta.get(v) ?? 0) + contribution);
      }
      if (w !== source) cb.set(w, (cb.get(w) ?? 0) + (delta.get(w) ?? 0));
    }
  }

  // Normalize to [0, 1] for comparability across graph sizes.
  const max = Math.max(...cb.values(), 1);
  for (const [id, value] of cb) cb.set(id, value / max);
  return cb;
}

export function computeMetrics(
  nodeIds: string[],
  edges: ArchiveEdge[],
  seeds: string[],
): GraphMetrics {
  const adjacency = buildAdjacency(nodeIds, edges);
  const ppr = personalizedPageRank(adjacency, seeds);
  const between = betweenness(adjacency);

  const degree = new Map<string, number>();
  for (const id of nodeIds) {
    degree.set(id, (adjacency.undirected.get(id) ?? []).length);
  }
  // Hub score = degree percentile. A page linked by everything is generic;
  // it will score high on betweenness without being a genuine bridge.
  const sorted = [...degree.values()].sort((a, b) => a - b);
  const hubScore = new Map<string, number>();
  for (const [id, d] of degree) {
    const rank = sorted.filter((v) => v < d).length;
    hubScore.set(id, sorted.length > 1 ? rank / (sorted.length - 1) : 0);
  }

  return { personalizedPageRank: ppr, betweenness: between, degree, hubScore };
}

/**
 * A genuine bridge: spans clusters, has real betweenness, and is NOT merely
 * a high-degree hub. The hub penalty is what separates "the office of the
 * herald" from "Society".
 */
export function isGenuineBridge(
  id: string,
  metrics: GraphMetrics,
  boundarySpan: number,
  options: { minBetweenness?: number; maxHub?: number } = {},
): boolean {
  const minBetweenness = options.minBetweenness ?? 0.2;
  const maxHub = options.maxHub ?? 0.9;
  return (
    (metrics.betweenness.get(id) ?? 0) >= minBetweenness &&
    (metrics.hubScore.get(id) ?? 0) <= maxHub &&
    boundarySpan >= 2
  );
}
