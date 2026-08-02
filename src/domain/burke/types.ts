import type { BurkeQuestion } from "@/domain/enums";
import type { ArticleInfo } from "@/domain/walk/types";

// The BurkeWalker's governing unit is an UNRESOLVED EXPLANATION inside an
// evolving story — not a page, not a theme, not a resemblance.
//
// The walker never asks "which candidate best matches the salience field?"
// It asks "what does the current account of the seed still fail to explain,
// and which candidate would most productively alter that account?"

export interface BurkeSeed {
  kind: "OBJECT" | "QUESTION";
  text: string;
}

/**
 * The curiosity priming, translated into structure rather than keywords.
 * This is a program for becoming curious, not a bag of weighted terms.
 */
export interface CuriosityProgram {
  seedAssumption: string;
  mattersOfConcern: string[];
  preferredMechanisms: string[];
  preferredHistoricalRelations: string[];
  desiredTensions: string[];
  suspectedGenealogies: string[];
  comparisonDimensions: string[];
  /** Explicit warnings about tempting but weak analogies. */
  avoidPatterns: string[];
  sourceDomainPreferences: string[];
  temporalPreferences: string[];
  geographicPreferences: string[];
  narrativeVoice: string;
  riskTolerance: number;
  analogyTolerance: number;
  causalityThreshold: number;
  surpriseWeight: number;
  historicalDepthWeight: number;
  preferredNavigationQuestions: string[];
}

export const QUESTION_TYPES = [
  "PRECONDITION",
  "PROBLEM",
  "SELECTION",
  "TRANSFORMATION",
  "ANALOGY",
  "RECODING",
] as const;

export type UnresolvedQuestionStatus =
  | "open"
  | "answered"
  | "reframed"
  | "abandoned";

export interface UnresolvedQuestion {
  id: string;
  question: string;
  questionType: BurkeQuestion;
  priority: number;
  originStep: number;
  status: UnresolvedQuestionStatus;
  answerSummary: string | null;
}

export type TheoryChangeType =
  | "initial"
  | "additive"
  | "corrective"
  | "substitutive"
  | "reframing";

export interface TheoryVersion {
  step: number;
  theory: string;
  changeType: TheoryChangeType;
  /** What the previous theory said that this supersedes. */
  supersedes: string | null;
  whatChanged: string;
  whyItChanged: string;
  confidence: number;
}

export interface EstablishedClaim {
  claim: string;
  supportNodeTitles: string[];
  confidence: number;
}

export interface RejectedHypothesis {
  hypothesis: string;
  reasonRejected: string;
  step: number;
}

export interface ReturnPath {
  nodeTitle: string;
  possibleRecode: string;
  strength: number;
}

export interface MysteryState {
  originalMystery: string;
  currentMystery: string;
  /** How much of the seed remains unexplained, 0–1. */
  mysteryScore: number;
  /** Complications that deepened the mystery productively. */
  productiveComplications: string[];
  resolvedComponents: string[];
}

export interface SaturationState {
  theoryChangeRate: number;
  unresolvedQuestionReduction: number;
  redundancyRate: number;
  estimatedSaturation: number;
}

/** The persistent, falsifiable, evolving account of the seed. */
export interface StoryState {
  seed: BurkeSeed;
  curiosityProgram: CuriosityProgram;
  currentTheory: string;
  theoryVersions: TheoryVersion[];
  unresolvedQuestions: UnresolvedQuestion[];
  unexplainedRemainder: string[];
  establishedClaims: EstablishedClaim[];
  rejectedHypotheses: RejectedHypothesis[];
  currentTension: string;
  returnPaths: ReturnPath[];
  mystery: MysteryState;
  saturation: SaturationState;
}

/** How a node relates to the seed. Deferred and uncertain are legitimate. */
export type SeedRelation = "direct" | "deferred" | "uncertain";

/** The evidential character of a node's contribution. Never conflated. */
export type EvidenceStatus =
  | "documented transmission"
  | "historical precondition"
  | "institutional relation"
  | "shared condition"
  | "structural analogy"
  | "speculative resonance";

/** Component scores behind one candidate's explanatory-gain ranking. */
export interface CandidateScores {
  questionAnsweringPotential: number;
  theoryRevisionPotential: number;
  historicalDependencyStrength: number;
  narrativeTensionGain: number;
  causalOrInstitutionalSpecificity: number;
  novelty: number;
  returnPotential: number;
  curiosityProgramFit: number;
  sourceQuality: number;
  lexicalSimilarityWithoutExplanatoryGain: number;
  analogyOnlyPenalty: number;
  redundancy: number;
  genericAbstractionPenalty: number;
  sensationalDetourPenalty: number;
  seedForcingPenalty: number;
}

export interface CandidateAssessment {
  title: string;
  scores: CandidateScores;
  /** Weighted total; computed by the engine, not the model. */
  total: number;
  relationType: EvidenceStatus;
  /** Named carrier — required when relationType is an analogy. */
  analogyCarrier: string | null;
  predictedClaim: string;
  predictedTheoryRevision: string;
  rationale: string;
}

/** The gate every candidate must pass before it is accepted as a node. */
export interface AcceptanceGate {
  addressedQuestionId: string | null;
  claimEstablished: string;
  howTheoryChanges: string;
  contributionKind:
    | "dependency"
    | "mechanism"
    | "contrast"
    | "transformation"
    | "none";
  strongerThanResemblance: boolean;
  followingQuestion: string;
  /** At least one gate criterion must be true, else the page is rejected. */
  answersHighPriorityQuestion: boolean;
  invalidatesPartOfTheory: boolean;
  revealsDeeperPrecondition: boolean;
  introducesConsequentialAlternative: boolean;
  createsStrongerNarrativePivot: boolean;
  enablesImprovedRecoding: boolean;
  verdict: "accept" | "reject";
  rejectionReason: string | null;
}

/** The bridge sentence justifying a transition, written before acceptance. */
export interface NarrativeBridge {
  fromTitle: string;
  toTitle: string;
  /** What the previous node failed to explain. */
  unexplainedByPrevious: string;
  /** Why this node is the next reasonable place to look. */
  whyNext: string;
  /** A bridge must stand without invoking the seed. */
  standsWithoutSeed: boolean;
}

/** The note format: a record of explanatory movement, not an observation. */
export interface BurkeNote {
  step: number;
  currentUnresolvedQuestion: string;
  selectedBurkeQuestion: BurkeQuestion;
  navigationQuestion: string;
  articleTitle: string;
  whyChosen: string;
  relevantEvidence: string;
  claimEstablishedOrChallenged: string;
  theoryBefore: string;
  theoryAfter: string;
  narrativePivot: string;
  newUnresolvedQuestion: string;
  seedRelation: SeedRelation;
  evidenceStatus: EvidenceStatus;
  analogyCarrier: string | null;
  confidence: number;
  bridge: NarrativeBridge | null;
}

export interface CoherenceReport {
  step: number;
  transitionsExplainableWithoutSeed: boolean;
  eachNodeArisesFromPriorDeficiency: boolean;
  accumulatingMechanismsNotExamples: boolean;
  governingQuestionChangedIntelligibly: boolean;
  removableNodes: string[];
  duplicateFunctionNodes: string[];
  sensationalHijack: boolean;
  movesBackwardThenForward: boolean;
  theoryDiffersFromInitial: boolean;
  score: number;
  diagnosis: string;
}

export type TheoryChangeClass =
  | "none"
  | "minor elaboration"
  | "meaningful refinement"
  | "major reframing"
  | "reversal";

export interface TheoryCheckpoint {
  version: number;
  afterAcceptedNodes: number;
  previousTheory: string;
  revisedTheory: string;
  decisiveDiscoveries: string[];
  whatRemainsUnexplained: string;
  strongestTension: string;
  nextBestQuestion: string;
  changeClass: TheoryChangeClass;
}

export type BurkeEndReason =
  | "REDESCRIPTION_ACHIEVED"
  | "QUESTIONS_RESOLVED"
  | "EXPLANATORY_SATURATION"
  | "NO_CANDIDATE_PASSES_GATE"
  | "PATHS_EXHAUSTED"
  | "PAGE_CAP_REACHED"
  | "REQUEST_BUDGET_EXHAUSTED";

export interface BurkeVisitedNode {
  info: ArticleInfo;
  categories: string[];
  visitIndex: number;
  note?: BurkeNote;
  /** Every candidate considered at this step, with component scores. */
  assessments: CandidateAssessment[];
  /** Gate results for candidates that were tried and refused. */
  rejections: Array<{ title: string; reason: string }>;
}

/** The final output: a narrative, not a list of page summaries. */
export interface BurkeNarrative {
  hook: string;
  initialApparentAnswer: string;
  firstContradiction: string;
  pivots: Array<{ title: string; motivation: string; development: string }>;
  reversals: string[];
  returnToSeed: string;
  remainingUncertainty: string;
  evidenceLedger: Array<{ claim: string; status: EvidenceStatus }>;
}

export interface BurkeWalkResult {
  visited: BurkeVisitedNode[];
  notes: BurkeNote[];
  storyState: StoryState;
  checkpoints: TheoryCheckpoint[];
  coherenceReports: CoherenceReport[];
  narrative: BurkeNarrative | null;
  backtrackCount: number;
  rejectedRoutes: Array<{ title: string; reason: string }>;
  endReason: BurkeEndReason;
  requestsUsed: number;
}

/**
 * The walker's judgment faculty. Every method is an act of explanatory
 * reasoning; none is a similarity measurement. The engine owns control
 * flow, budgets, gates, and backtracking — the oracle owns judgment.
 */
export interface BurkeOracle {
  /** Build the initial StoryState: theory, questions, mystery, tension. */
  initialize(input: {
    seed: BurkeSeed;
    priming: string;
    historicalConsciousness: Record<string, boolean>;
    endpointStrategy: string;
    plannedLength: number;
  }): Promise<{ curiosityProgram: CuriosityProgram; state: StoryState }>;

  /**
   * Diagnose the story's most consequential deficiency, choose the Burke
   * question that addresses it, and phrase one precise navigation question.
   * This happens BEFORE candidates are collected.
   */
  diagnose(input: {
    state: StoryState;
    notes: BurkeNote[];
    currentTitle: string;
  }): Promise<{
    deficiency: string;
    questionId: string | null;
    burkeQuestion: BurkeQuestion;
    navigationQuestion: string;
    /** Search phrases derived from the question, for candidate generation. */
    searchPhrases: string[];
  }>;

  /** Judge candidates by explanatory gain against the navigation question. */
  assess(input: {
    state: StoryState;
    navigationQuestion: string;
    burkeQuestion: BurkeQuestion;
    currentTitle: string;
    candidates: Array<{ title: string; summary: string }>;
  }): Promise<CandidateAssessment[]>;

  /** The acceptance gate plus the bridge from the previous node. */
  gate(input: {
    state: StoryState;
    navigationQuestion: string;
    previousTitle: string;
    candidate: { title: string; summary: string };
    assessment: CandidateAssessment;
    requireBridge: boolean;
  }): Promise<{ gate: AcceptanceGate; bridge: NarrativeBridge | null }>;

  /** Contrastive theory revision after an accepted node. */
  revise(input: {
    state: StoryState;
    acceptedTitle: string;
    evidence: string;
    gate: AcceptanceGate;
    step: number;
  }): Promise<{
    theoryVersion: TheoryVersion;
    note: Omit<BurkeNote, "bridge">;
    questionUpdates: Array<{
      id: string;
      status: UnresolvedQuestionStatus;
      answerSummary: string | null;
    }>;
    newQuestions: UnresolvedQuestion[];
    claims: EstablishedClaim[];
    mystery: MysteryState;
    currentTension: string;
    returnPaths: ReturnPath[];
  }>;

  /** Theory-revision checkpoint (replaces summary-style elasticity). */
  checkpoint(input: {
    state: StoryState;
    notes: BurkeNote[];
    previousCheckpoint: TheoryCheckpoint | null;
  }): Promise<Omit<TheoryCheckpoint, "version" | "afterAcceptedNodes">>;

  /** Thread coherence test over the accepted chain. */
  coherence(input: {
    state: StoryState;
    notes: BurkeNote[];
  }): Promise<Omit<CoherenceReport, "step">>;

  /** Final narrative built from theory versions and motivated pivots. */
  narrate(input: {
    state: StoryState;
    notes: BurkeNote[];
    checkpoints: TheoryCheckpoint[];
  }): Promise<BurkeNarrative>;
}
