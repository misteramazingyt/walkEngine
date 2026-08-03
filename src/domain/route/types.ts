import type { RoutePlanModel, RouteStepModel } from "@/schemas/route";

// Planning a route before touching the archive, then verifying it against
// the archive. The existing modes discover by sampling links, which is why
// their output reads like a link crawl: adjacency is the only relation a
// crawl can see, so it becomes the only relation the prose can express.

export type RouteStep = RouteStepModel;
export type RoutePlan = RoutePlanModel;

export interface VerifiedStep {
  step: RouteStep;
  /** Resolved article title; differs from the plan when redirected. */
  title: string;
  summary: string;
  url: string;
}

export interface ScriptOracle {
  writeBeat(input: {
    index: number;
    total: number;
    seed: string;
    step: RouteStep;
    title: string;
    summary: string;
    previousProse: string;
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

  repair(input: {
    failures: Array<{ step: RouteStep; candidates: string[] }>;
  }): Promise<Array<{ pageTitle: string; replacesTitle: string }>>;
}
