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
    /** The whole article: circumstances, disputes, dates, quarrels. */
    extract: string;
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

export interface DwellPhase {
  scene: string;
  particular: string;
  carrier: string;
  problemCaused: string;
  determination: string;
}

export interface RouteOracle {
  /**
   * Check a seam's carrier against both full articles, replacing a trend
   * dressed as an event with a real one, or reporting honestly that the
   * archive shows no passage — in which case the seam cuts cleanly rather
   * than faking a link. Prompts asked for real carriers four times and got
   * "the growing complexity of society"; only a check makes it true.
   */
  verifyCarrier(input: {
    prevTitle: string;
    prevExtract: string;
    nextTitle: string;
    nextExtract: string;
    claimed: string;
    claimedEvidence: string;
    /** What the previous subject left changed in the shared world. */
    changedEnvironment: string;
  }): Promise<{
    found: boolean;
    carrier: string;
    evidence: string;
    mechanism: string;
    motivation: string;
  }>;

  /**
   * A subject that earned several beats needs several distinct episodes,
   * not one episode repeated. Duplicating the step gave the writer nothing
   * new to say, and a writer with nothing new to say forecasts: "the next
   * great revolution would decentralize this authority."
   */
  expandDwell(input: {
    title: string;
    extract: string;
    baseStep: RouteStep;
    phases: number;
    objectOfInquiry: string;
    seed: string;
  }): Promise<DwellPhase[]>;

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
