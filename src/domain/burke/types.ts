import type { BurkeQuestion } from "@/domain/enums";
import type { ArticleInfo } from "@/domain/walk/types";

// The BurkeWalker stores curiosity programs, not explanations. These types
// carry the five layers: seed, salience, question grammar, move criteria,
// and four-field narrative compression.

export interface BurkeSeed {
  kind: "OBJECT" | "QUESTION";
  text: string;
}

/** The dog's scent: what the walker becomes sensitive to (weight 1–3). */
export interface SalienceWeight {
  term: string;
  weight: number;
}

/** Move-criteria judgment for one candidate page (each 0–1). */
export interface CandidateJudgment {
  title: string;
  novelty: number;
  historicalDepth: number;
  narrativeTension: number;
  conceptualFit: number;
  explanatoryGain: number;
  /** The Burkean criterion: can this page eventually illuminate the seed? */
  returnPotential: number;
  /** returnPotential too low → discarded regardless of other scores. */
  discarded: boolean;
  rationale: string;
}

/** Narrative compression: every note has exactly these four fields. */
export interface BurkeNote {
  visitIndex: number;
  articleTitle: string;
  question: BurkeQuestion;
  observation: string;
  changedUnderstanding: string;
  returnToSeed: string;
}

export interface StepDecision {
  chosenTitle: string;
  question: BurkeQuestion;
  observation: string;
  changedUnderstanding: string;
  returnToSeed: string;
  judgments: CandidateJudgment[];
  /** The walker believes redescription of the seed is now possible. */
  redescriptionAchieved: boolean;
}

/** Narrative elasticity: the three-sentence story told right now. */
export interface ElasticityCheckpoint {
  afterPages: number;
  story: string;
  changedSubstantially: boolean;
  rationale: string;
}

export type BurkeEndReason =
  | "REDESCRIPTION_ACHIEVED"
  | "EXPLANATORY_SATURATION"
  | "PAGE_CAP_REACHED"
  | "NO_ELIGIBLE_CANDIDATES"
  | "REQUEST_BUDGET_EXHAUSTED";

export interface BurkeVisitedNode {
  info: ArticleInfo;
  categories: string[];
  visitIndex: number;
  note?: BurkeNote; // the start node has no note; it is the given
  judgments: CandidateJudgment[];
}

export interface BurkeWalkResult {
  visited: BurkeVisitedNode[];
  notes: BurkeNote[];
  salience: SalienceWeight[];
  checkpoints: ElasticityCheckpoint[];
  finalRedescription: string;
  endReason: BurkeEndReason;
  requestsUsed: number;
}

/**
 * The walker's judgment faculty. The LLM implementation lives in
 * integrations; a deterministic fixture implementation powers tests and
 * offline mode. The engine is agnostic.
 */
export interface BurkeOracle {
  /** Convert natural-language priming (+ optional motif) into salience. */
  prime(input: {
    seed: BurkeSeed;
    priming: string;
    motifSensitivity: string[];
  }): Promise<SalienceWeight[]>;

  /** Judge candidates, choose one, ask one Burke question, write the note. */
  step(input: {
    seed: BurkeSeed;
    salience: SalienceWeight[];
    current: { title: string; summary: string };
    candidates: Array<{ title: string; summary: string }>;
    notesSoFar: BurkeNote[];
    preferredQuestions: BurkeQuestion[];
  }): Promise<StepDecision>;

  /** Tell the three-sentence story of the seed as understood right now. */
  elasticity(input: {
    seed: BurkeSeed;
    notesSoFar: BurkeNote[];
    previousStory: string | null;
  }): Promise<{ story: string; changedSubstantially: boolean; rationale: string }>;

  /** Final recoding: redescribe the original object. */
  recode(input: {
    seed: BurkeSeed;
    notes: BurkeNote[];
    checkpoints: ElasticityCheckpoint[];
  }): Promise<string>;
}
