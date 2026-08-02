import type { WalkMode } from "@/domain/enums";
import type { SeededRng } from "./prng";
import type { WalkConfiguration } from "@/schemas/walk-configuration";

// The shared traversal contract. Every mode receives the same context —
// gateways, seeded randomness, configuration, a progress reporter — and
// returns a mode-specific result that its own persist step writes.
//
// This exists so retrieval, budgeting, start resolution, and progress
// reporting are written once. It deliberately does NOT unify the modes'
// results or their oracles: a path of pages, three candidate paths, a
// story state, and a debt ledger are different objects, and pretending
// otherwise would cost more than it saves.

export interface StrategyProgress {
  stage: string;
  currentTitle: string;
  /** Units completed and expected — meaning varies by mode. */
  completed: number;
  target: number;
  requestsUsed: number;
}

export interface StrategyContext<TGateways> {
  gateways: TGateways;
  rng: SeededRng;
  configuration: WalkConfiguration;
  /** Resolved entry article; pinned on same-seed regeneration. */
  startTitle: string;
  reportProgress: (progress: StrategyProgress) => Promise<void>;
}

export interface WalkStrategy<TGateways, TResult> {
  readonly mode: WalkMode;
  run(context: StrategyContext<TGateways>): Promise<TResult>;
}

/** Schema version stamped on persisted run records. */
export const RUN_SCHEMA_VERSION = 1;
