// The sampled archive: a local, directed, weighted graph built from
// stochastic exploration. Edge types are never flattened into an
// unexamined score — provenance and relation type are kept so that a
// cluster's cohesion can later be explained rather than merely asserted.

export type ArchiveEdgeRelation =
  | "outlink"
  | "inlink"
  | "reciprocal_link"
  | "shared_neighbor"
  | "shared_category"
  | "wikidata_relation"
  | "entity_cooccurrence"
  | "temporal_proximity"
  | "geographic_proximity";

/** Default confidence of each relation type as evidence of connection. */
export const RELATION_WEIGHTS: Record<ArchiveEdgeRelation, number> = {
  reciprocal_link: 1.0,
  wikidata_relation: 0.95,
  outlink: 0.6,
  inlink: 0.6,
  shared_neighbor: 0.5,
  shared_category: 0.35,
  entity_cooccurrence: 0.3,
  temporal_proximity: 0.2,
  geographic_proximity: 0.2,
};

export interface ArchiveNode {
  /** Canonical Wikipedia title; the node identity throughout. */
  id: string;
  title: string;
  url: string;
  summary: string;
  length: number;
  wikidataId?: string;
  categories: string[];
  entityTypes: string[];
  eraStart?: number;
  eraEnd?: number;
  coord?: { lat: number; lon: number };
  sitelinks?: number;
  /** Graph level at first discovery: 0 seed region, 1 outlink, 2 second-order. */
  level: number;
  /** Which walk episodes touched this node. */
  episodeIds: string[];
}

export interface ArchiveEdge {
  sourceId: string;
  targetId: string;
  relationType: ArchiveEdgeRelation;
  weight: number;
  /** Where the relation was observed — never inferred silently. */
  provenance: string;
}

export type WalkPolicy =
  | "novelty_biased"
  | "personalized_pagerank"
  | "non_backtracking"
  | "attention_biased"
  | "surprise_jump";

/** The default mixture, per the brief. Deficiency-conditioned variant below. */
export const DEFAULT_POLICY_MIX: Record<WalkPolicy, number> = {
  novelty_biased: 0.35,
  personalized_pagerank: 0.25,
  non_backtracking: 0.2,
  attention_biased: 0.1,
  surprise_jump: 0.1,
};

/** Once a deficiency is selected it takes over local direction. */
export const DEFICIENCY_POLICY_MIX: Record<WalkPolicy, number> = {
  novelty_biased: 0.3,
  personalized_pagerank: 0.25,
  non_backtracking: 0.2,
  attention_biased: 0.15,
  surprise_jump: 0.1,
};

export interface WalkEpisode {
  id: string;
  policy: WalkPolicy;
  startTitle: string;
  path: string[];
  hops: number;
  restarted: boolean;
  novelNodes: number;
}

export interface SampledArchive {
  nodes: Map<string, ArchiveNode>;
  edges: ArchiveEdge[];
  episodes: WalkEpisode[];
  rejected: Array<{ title: string; reason: string }>;
  requestsUsed: number;
  /** Share of newly seen nodes in the final episodes. */
  noveltyRate: number;
  revisitRate: number;
}

export interface GraphMetrics {
  /** Personalized PageRank relative to the current subject region. */
  personalizedPageRank: Map<string, number>;
  betweenness: Map<string, number>;
  degree: Map<string, number>;
  /** Degree percentile — high means hub, which is not the same as bridge. */
  hubScore: Map<string, number>;
}

export interface DetectedCluster {
  id: string;
  resolution: number;
  memberIds: string[];
  /** Internal edge weight / total incident weight. */
  density: number;
  conductance: number;
  modularityContribution: number;
  /** Members ranked by personalized PageRank. */
  topByRelevance: string[];
  /** Members ranked by within-cluster degree. */
  topByCentrality: string[];
  /** High betweenness AND low hub score AND boundary-spanning. */
  bridges: string[];
}

export interface ClusteringResult {
  chosenResolution: number;
  clusters: DetectedCluster[];
  /** All resolutions tried, with the composite that selected the winner. */
  resolutionReports: Array<{
    resolution: number;
    clusterCount: number;
    modularity: number;
    meanConductance: number;
    stability: number;
    composite: number;
  }>;
}
