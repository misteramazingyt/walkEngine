import type { ArticleInfo } from "@/domain/walk/types";
import type {
  ConcreteAnchor,
  EvidenceStatus,
  NarrativeBridge,
} from "@/domain/explanation/types";

// ANAMNESIS — the endpoint-first strategy.
//
// The user supplies a TERMINAL SENTENCE: a felt ending they want to be able
// to say, and have land with its full weight. The walk's question is not
// "what happens next?" but:
//
//   "What sequence of mediations would make this sentence conceptually and
//    historically inhabitable?"
//
// The sentence is decomposed into CHARGES — the words, claims, feelings, and
// rhetorical turns that carry its force. Each charge incurs DEBTS: things
// the reader must already possess for the charge to land rather than fall
// flat. The walk then searches the archive for MEDIATIONS that pay those
// debts with concrete historical material.
//
// The walk ends not when pages run out but when the sentence has become
// INHABITABLE: re-read at the end, it should register as something the
// reader now already knows. That recognition is the anamnetic moment, and
// it is why the composed narrative closes on the user's sentence verbatim.

export type Register =
  | "recognition"
  | "vertigo"
  | "grief"
  | "irony"
  | "resolve"
  | "unease";

export interface TerminalSentence {
  text: string;
  /** The feeling the sentence is meant to produce on arrival. */
  register: Register;
  /** Optional gloss of what the user means by it. */
  intent: string;
}

export type ChargeKind = "lexical" | "claim" | "affective" | "structural";

/** An element of the sentence that carries part of its force. */
export interface Charge {
  id: string;
  kind: ChargeKind;
  /** The exact span of the sentence carrying this charge. */
  fragment: string;
  whatItAsserts: string;
  /** Share of the sentence's total force, 0–1. */
  weight: number;
}

export type DebtType =
  | "unfamiliar_term"
  | "unearned_claim"
  | "missing_precedent"
  | "absent_contrast"
  | "unfelt_stakes"
  | "unmarked_irony"
  | "assumed_institution"
  | "assumed_mechanism";

export type DebtStatus =
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "reframed"
  | "abandoned";

/** What the sentence owes the reader before a charge can land. */
export interface Debt {
  id: string;
  chargeId: string;
  /** "The reader must already know/feel X." */
  statement: string;
  debtType: DebtType;
  priority: number;
  status: DebtStatus;
  /** Titles of the mediations that paid it. */
  paidBy: string[];
  /** What remains owed after a partial payment — this breeds new debts. */
  residue: string | null;
}

/** A historical waypoint that pays a debt with concrete material. */
export interface Mediation {
  step: number;
  articleTitle: string;
  debtId: string;
  chargeId: string;
  /** The search question this mediation was found in answer to. */
  searchQuestion: string;
  whatItSupplies: string;
  howItPays: string;
  anchor: ConcreteAnchor;
  /** How the terminal sentence reads differently now. */
  transformedUnderstanding: string;
  evidenceStatus: EvidenceStatus;
  bridge: NarrativeBridge | null;
  residue: string | null;
  confidence: number;
}

/**
 * Re-reading the terminal sentence mid-walk. The anamnetic analogue of
 * Burke's theory checkpoint: not "what have we learned" but "does it land
 * yet, and what still falls flat?"
 */
export interface RecollectionTest {
  afterMediations: number;
  /** The sentence re-read in light of what the walk has established. */
  rereading: string;
  whatNowLands: string[];
  whatStillFallsFlat: string[];
  inhabitabilityScore: number;
  inhabitable: boolean;
}

export interface GlossVersion {
  step: number;
  gloss: string;
  changedBy: string;
  whatChanged: string;
}

/** The evolving state of the sentence's earned meaning. */
export interface AnamnesisState {
  terminal: TerminalSentence;
  charges: Charge[];
  debts: Debt[];
  /** The current best paraphrase of what the sentence has come to mean. */
  currentGloss: string;
  glossVersions: GlossVersion[];
  /** Anchors collected so far — the reader's furniture. */
  anchors: ConcreteAnchor[];
  abandonedRoutes: Array<{ title: string; reason: string }>;
}

export interface CandidateMediationScores {
  debtPaymentPotential: number;
  concreteAnchorStrength: number;
  historicalSpecificity: number;
  affectiveCharge: number;
  preparesLaterCharges: number;
  archivalWarrant: number;
  novelty: number;
  registerFit: number;
  sourceQuality: number;
  restatesWithoutEarning: number;
  abstractionWithoutAnchor: number;
  redundancy: number;
  sentimentality: number;
  anachronism: number;
  decorativeDetour: number;
}

export interface CandidateMediationAssessment {
  title: string;
  scores: CandidateMediationScores;
  /** Weighted total, computed by the engine rather than the model. */
  total: number;
  evidenceStatus: EvidenceStatus;
  predictedPayment: string;
  proposedAnchor: string;
  rationale: string;
}

/** The gate a candidate must pass before becoming a mediation. */
export interface MediationGate {
  debtId: string;
  paysDebt: boolean;
  /** Partial payment is legitimate and must declare its residue. */
  paymentCompleteness: "full" | "partial" | "none";
  residue: string | null;
  suppliesConcreteAnchor: boolean;
  anchor: ConcreteAnchor | null;
  /** Restating the sentence more elaborately is not payment. */
  earnsRatherThanRestates: boolean;
  transformedUnderstanding: string;
  evidenceStatus: EvidenceStatus;
  verdict: "accept" | "reject";
  rejectionReason: string | null;
}

export type AnamnesisEndReason =
  | "SENTENCE_INHABITABLE"
  | "DEBTS_SETTLED"
  | "DIMINISHING_PAYMENT"
  | "NO_CANDIDATE_PAYS"
  | "MEDIATION_CAP_REACHED"
  | "REQUEST_BUDGET_EXHAUSTED";

export interface AnamnesisVisitedNode {
  info: ArticleInfo;
  categories: string[];
  visitIndex: number;
  mediation?: Mediation;
  assessments: CandidateMediationAssessment[];
  rejections: Array<{ title: string; reason: string }>;
}

/**
 * The composed arrival. Mediations are ordered for preparation, not for
 * discovery: each movement must make the next receivable, and the piece
 * closes on the user's sentence verbatim.
 */
export interface AnamnesisComposition {
  opening: string;
  movements: Array<{
    title: string;
    /** Why this must be met before what follows. */
    preparesWhat: string;
    prose: string;
  }>;
  /** Explicit justification when composition order ≠ discovery order. */
  orderingRationale: string;
  approach: string;
  /** The user's sentence, unaltered. */
  terminalSentence: string;
  whatRemainsUnearned: string;
  ledger: Array<{ claim: string; status: EvidenceStatus }>;
}

export interface AnamnesisWalkResult {
  visited: AnamnesisVisitedNode[];
  mediations: Mediation[];
  state: AnamnesisState;
  recollectionTests: RecollectionTest[];
  composition: AnamnesisComposition | null;
  abandonedRoutes: Array<{ title: string; reason: string }>;
  endReason: AnamnesisEndReason;
  requestsUsed: number;
}

/**
 * The walker's judgment faculty. As with Burke, the engine owns control
 * flow, budgets, gates, and ordering; the oracle owns every act of reading.
 */
export interface AnamnesisOracle {
  /** Decompose the terminal sentence into charges and the debts they incur. */
  decompose(input: {
    terminal: TerminalSentence;
    audienceNote: string;
  }): Promise<{
    charges: Charge[];
    debts: Debt[];
    initialGloss: string;
  }>;

  /**
   * Choose the debt to pay next and phrase the archival question that would
   * pay it. Happens BEFORE candidates are collected.
   */
  selectDebt(input: {
    state: AnamnesisState;
    mediations: Mediation[];
    currentTitle: string;
  }): Promise<{
    debtId: string;
    reasoning: string;
    searchQuestion: string;
    searchPhrases: string[];
  }>;

  /** Judge candidates by what they would pay, not by what they resemble. */
  assess(input: {
    state: AnamnesisState;
    debt: Debt;
    searchQuestion: string;
    currentTitle: string;
    candidates: Array<{ title: string; summary: string }>;
  }): Promise<CandidateMediationAssessment[]>;

  /** The acceptance gate, plus the bridge from the previous mediation. */
  gate(input: {
    state: AnamnesisState;
    debt: Debt;
    searchQuestion: string;
    previousTitle: string;
    candidate: { title: string; summary: string };
    assessment: CandidateMediationAssessment;
    requireBridge: boolean;
  }): Promise<{ gate: MediationGate; bridge: NarrativeBridge | null }>;

  /** Record the payment and re-gloss the sentence. */
  integrate(input: {
    state: AnamnesisState;
    debt: Debt;
    acceptedTitle: string;
    gate: MediationGate;
    step: number;
  }): Promise<{
    mediation: Omit<Mediation, "bridge" | "step" | "searchQuestion">;
    gloss: GlossVersion;
    /** Residue and discovery routinely breed further debts. */
    newDebts: Debt[];
    debtStatus: DebtStatus;
  }>;

  /** Re-read the terminal sentence: does it land yet? */
  recollect(input: {
    state: AnamnesisState;
    mediations: Mediation[];
  }): Promise<Omit<RecollectionTest, "afterMediations">>;

  /** Order the mediations for preparation and write the arrival. */
  compose(input: {
    state: AnamnesisState;
    mediations: Mediation[];
    recollectionTests: RecollectionTest[];
  }): Promise<AnamnesisComposition>;
}
