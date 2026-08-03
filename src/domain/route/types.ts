import type { RoutePlanModel, RouteStepModel } from "@/schemas/route";

// Planning a route before touching the archive, then verifying it against
// the archive. The existing modes discover by sampling links, which is why
// their output reads like a link crawl: adjacency is the only relation a
// crawl can see, so it becomes the only relation the prose can express.

/**
 * Bridge kind is not part of the planning schema: it is dealt by the
 * software to match the measured distribution, and showing the model the
 * enum only invited it to fill the field with values outside it.
 */
export type BridgeKind =
  | "carried_subject"
  | "consequence"
  | "problem_raised"
  | "instrument_needed"
  | "return_to_earlier"
  | "contrast"
  | "hard_cut";

export type RouteStep = RouteStepModel & { bridgeKind?: BridgeKind };
/** Steps carry the software-assigned bridge kind the schema does not. */
export type RoutePlan = Omit<RoutePlanModel, "steps"> & { steps: RouteStep[] };



export interface ScriptOracle {
  writeBeat(input: {
    index: number;
    total: number;
    seed: string;
    step: RouteStep;
    title: string;
    summary: string;
    previousProse: string;
    /** Subjects live now, to be mentioned without being explained. */
    supporting: Array<{ title: string; gloss: string; firstMention: boolean }>;
    /** The configuration of the beat's own subject. */
    substrate: string;
    institution: string;
    selfUnderstanding: string;
    /** The object whose understanding accumulates, and the question asked. */
    objectOfInquiry: string;
    question: string;
    stance: string;
    /** Determinations established so far, numbered as the plan numbers them. */
    ledger: Array<{ index: number; determination: string }>;
    /** The ones this beat is required to reopen. */
    revises: Array<{ index: number; determination: string }>;
  }): Promise<{ prose: string; forkSentence: string }>;
}

export interface RouteOracle {
  plan(input: {
    seed: string;
    attention: string;
    temporalStart: number | null;
    temporalEnd: number | null;
    stepTarget: number;
    targetWords: number;
    density: string;
    namedConnections: string[];
    thesis: string;
  }): Promise<RoutePlan>;

  /** Cast members whose page did not resolve, with real search candidates. */
  repair(input: {
    failures: Array<{
      step: { pageTitle: string; bearsOnSeed: string };
      candidates: string[];
    }>;
  }): Promise<Array<{ pageTitle: string; replacesTitle: string }>>;
}
