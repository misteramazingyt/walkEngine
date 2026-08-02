import type {
  ArchiveEdge,
  ArchiveNode,
  DetectedCluster,
  GraphMetrics,
} from "./types";

// Cluster summary packets. The LLM is never shown thousands of raw nodes —
// it receives a compact, structured account of each concentration, with the
// measurements marked as advisory. Subjecthood is a stratified judgment; the
// numbers inform it and never decide it.

export interface ClusterPacket {
  clusterId: string;
  size: number;
  density: number;
  conductance: number;
  modularityContribution: number;
  topByRelevance: Array<{ title: string; summary: string; ppr: number }>;
  topByCentrality: string[];
  bridges: string[];
  representativeTitles: string[];
  recurringEntityTypes: string[];
  recurringCategories: string[];
  periods: string;
  places: string[];
  dominantRelations: string[];
  anomalies: string[];
  complementarity: number;
  audienceIntelligibility: number;
  concreteAnchorTitles: string[];
  attentionFit: number;
  /** How often cluster pages touch the selected deficiency's terms. */
  deficiencyTermHits: number;
}

const CONCRETE_TYPE_HINTS = [
  "tool", "instrument", "building", "city", "document", "book", "machine",
  "ship", "artifact", "device", "route", "kingdom", "facility", "structure",
  "monument", "object", "detector", "practice", "ritual", "festival",
  "institution", "office", "human", "person", "event", "battle", "treaty",
];

const ABSTRACT_HINTS = [
  "concept", "field", "theory", "discipline", "phenomenon", "property",
  "category", "process", "quality",
];

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
}

function overlapScore(text: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  const tokens = tokenize(text);
  const termTokens = new Set(terms.flatMap((t) => [...tokenize(t)]));
  let hits = 0;
  for (const t of termTokens) if (tokens.has(t)) hits += 1;
  return Math.min(1, hits / 4);
}

function isConcrete(node: ArchiveNode): boolean {
  const joined = [...node.entityTypes, ...node.categories].join(" ").toLowerCase();
  if (CONCRETE_TYPE_HINTS.some((h) => joined.includes(h))) return true;
  // Wikidata era or coordinates are decent evidence of situatedness.
  return node.eraStart !== undefined || node.coord !== undefined;
}

function isAbstract(node: ArchiveNode): boolean {
  const joined = node.entityTypes.join(" ").toLowerCase();
  return ABSTRACT_HINTS.some((h) => joined.includes(h));
}

/**
 * Audience intelligibility from archival signals rather than readability
 * scores. A Simple-English sitelink, a concrete Wikidata type, a date, a
 * place, and a short lead sentence are better evidence that something can be
 * explained to a twelve-year-old than any Flesch number.
 */
export function pageIntelligibility(node: ArchiveNode): number {
  let score = 0;
  if (isConcrete(node)) score += 0.35;
  if (node.eraStart !== undefined) score += 0.15;
  if (node.coord !== undefined) score += 0.1;
  // Broad sitelink coverage implies the topic is widely explicable.
  if ((node.sitelinks ?? 0) >= 25) score += 0.2;
  const firstSentence = node.summary.split(/(?<=\.)\s/)[0] ?? node.summary;
  if (firstSentence.length > 0 && firstSentence.length <= 180) score += 0.1;
  if (node.length >= 4000) score += 0.1;
  if (isAbstract(node)) score -= 0.15;
  return Math.max(0, Math.min(1, score));
}

/**
 * Complementarity: does the cluster contain materially different kinds of
 * page, or many pages saying the same thing? A cluster of five synonyms is
 * useless however tightly it clusters.
 */
export function clusterComplementarity(
  members: ArchiveNode[],
  internalEdges: ArchiveEdge[],
): number {
  if (members.length === 0) return 0;

  const types = new Set(
    members.flatMap((m) => m.entityTypes.map((t) => t.toLowerCase())),
  );
  const typeDiversity = Math.min(1, types.size / Math.max(3, members.length / 2));

  const concrete = members.filter(isConcrete).length / members.length;
  const abstract = members.filter(isAbstract).length / members.length;
  // Best case is a mixture: mechanisms AND examples, not one or the other.
  const mechanismExampleBalance = 1 - Math.abs(concrete - (1 - abstract - concrete));

  const eras = members
    .map((m) => m.eraStart)
    .filter((e): e is number => e !== undefined);
  const temporalStructure =
    eras.length >= 2
      ? Math.min(1, (Math.max(...eras) - Math.min(...eras)) / 400)
      : 0;

  // Redundancy: pairwise lead-text overlap. High means restatement.
  let pairs = 0;
  let overlapSum = 0;
  for (let i = 0; i < members.length && i < 10; i++) {
    for (let j = i + 1; j < members.length && j < 10; j++) {
      const a = tokenize(members[i].summary);
      const b = tokenize(members[j].summary);
      let shared = 0;
      for (const t of a) if (b.has(t)) shared += 1;
      const union = a.size + b.size - shared || 1;
      overlapSum += shared / union;
      pairs += 1;
    }
  }
  const redundancy = pairs > 0 ? overlapSum / pairs : 0;

  const listArtifacts =
    members.filter((m) => /^(List|Index|Outline|Timeline) of /i.test(m.title))
      .length / members.length;

  const internalBridge = Math.min(
    1,
    internalEdges.length / Math.max(1, members.length),
  );

  return Math.max(
    0,
    Math.min(
      1,
      0.25 * typeDiversity +
        0.2 * mechanismExampleBalance +
        0.15 * temporalStructure +
        0.2 * internalBridge +
        0.2 * (1 - redundancy) -
        0.3 * listArtifacts,
    ),
  );
}

export function buildClusterPacket(options: {
  cluster: DetectedCluster;
  nodes: Map<string, ArchiveNode>;
  edges: ArchiveEdge[];
  metrics: GraphMetrics;
  attentionTerms: string[];
  deficiencyTerms: string[];
}): ClusterPacket {
  const { cluster, nodes, edges, metrics, attentionTerms, deficiencyTerms } =
    options;
  const memberSet = new Set(cluster.memberIds);
  const members = cluster.memberIds
    .map((id) => nodes.get(id))
    .filter((n): n is ArchiveNode => !!n);

  const internalEdges = edges.filter(
    (e) => memberSet.has(e.sourceId) && memberSet.has(e.targetId),
  );

  const relationCounts = new Map<string, number>();
  for (const edge of internalEdges) {
    relationCounts.set(
      edge.relationType,
      (relationCounts.get(edge.relationType) ?? 0) + 1,
    );
  }

  const typeCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  for (const member of members) {
    for (const type of member.entityTypes) {
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    }
    for (const category of member.categories) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
  }

  const eras = members
    .map((m) => m.eraStart)
    .filter((e): e is number => e !== undefined);
  const periods =
    eras.length > 0
      ? `${Math.min(...eras)} to ${Math.max(...eras.map((e, i) => members[i]?.eraEnd ?? e))}`
      : "no dated members";

  const places = members
    .filter((m) => m.coord)
    .slice(0, 5)
    .map((m) => `${m.title} (${m.coord!.lat.toFixed(1)}, ${m.coord!.lon.toFixed(1)})`);

  const intelligibilities = members.map(pageIntelligibility);
  const audienceIntelligibility =
    intelligibilities.length > 0
      ? intelligibilities.reduce((a, b) => a + b, 0) / intelligibilities.length
      : 0;

  const concreteAnchorTitles = members
    .filter(isConcrete)
    .sort((a, b) => pageIntelligibility(b) - pageIntelligibility(a))
    .slice(0, 4)
    .map((m) => m.title);

  // Anomalies: members with almost no internal connection — likely artifacts
  // of random traversal rather than constituents of the concentration.
  const internalDegree = new Map<string, number>();
  for (const edge of internalEdges) {
    internalDegree.set(edge.sourceId, (internalDegree.get(edge.sourceId) ?? 0) + 1);
    internalDegree.set(edge.targetId, (internalDegree.get(edge.targetId) ?? 0) + 1);
  }
  const anomalies = members
    .filter((m) => (internalDegree.get(m.id) ?? 0) <= 1)
    .slice(0, 4)
    .map((m) => m.title);

  const clusterText = members
    .map((m) => `${m.title} ${m.summary}`)
    .join(" ");

  return {
    clusterId: cluster.id,
    size: members.length,
    density: cluster.density,
    conductance: cluster.conductance,
    modularityContribution: cluster.modularityContribution,
    topByRelevance: cluster.topByRelevance
      .map((id) => nodes.get(id))
      .filter((n): n is ArchiveNode => !!n)
      .map((n) => ({
        title: n.title,
        summary: n.summary.slice(0, 320),
        ppr: metrics.personalizedPageRank.get(n.id) ?? 0,
      })),
    topByCentrality: cluster.topByCentrality,
    bridges: cluster.bridges,
    representativeTitles: members.slice(0, 12).map((m) => m.title),
    recurringEntityTypes: [...typeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([t]) => t),
    recurringCategories: [...categoryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([c]) => c),
    periods,
    places,
    dominantRelations: [...relationCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([r, n]) => `${r} ×${n}`),
    anomalies,
    complementarity: clusterComplementarity(members, internalEdges),
    audienceIntelligibility,
    concreteAnchorTitles,
    attentionFit: overlapScore(clusterText, attentionTerms),
    deficiencyTermHits: overlapScore(clusterText, deficiencyTerms),
  };
}
