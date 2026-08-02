import type { CriteriologicalConfig, EnrichedVisitedNode } from "./criteriological-walk";
import type { PathScore } from "./features";

// Beam search over partial paths — INTERFACE ONLY, feature-flagged off.
// The spec calls for maintaining the top-k partial paths and scoring
// path-level coherence rather than hopping greedily. Implementing it well
// multiplies the request budget by the beam width, so it stays behind this
// flag until the criteriological single-path walk has proven itself.

export const BEAM_SEARCH_ENABLED = false;

export interface BeamCandidatePath {
  nodes: EnrichedVisitedNode[];
  pathScore: PathScore;
}

export interface BeamSearchEngine {
  run(options: {
    config: CriteriologicalConfig & { beamWidth: number };
    startTitle: string;
  }): Promise<BeamCandidatePath[]>;
}
