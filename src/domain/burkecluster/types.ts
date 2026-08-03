import type { BurkeQuestion } from "@/domain/enums";
import type { EvidenceStatus } from "@/domain/explanation/types";
import type { ClusterPacket } from "@/domain/graph/packet";
import type {
  ArchiveEdge,
  ArchiveNode,
  ClusteringResult,
  WalkEpisode,
} from "@/domain/graph/types";

// BURKECLUSTER — stochastic subject discovery, governed by deficiency.
//
// The basic unit is not the page but the SUBJECT CLUSTER: a local
// concentration of complementary pages with a discoverable organizing
// subject. But clusters are not independently available destinations in a
// flat space. The next subject must emerge from the NARRATION of the
// current one:
//
//   narration → predicate → deficiency → conditioned stochastic sampling
//   → cluster → subject → incipit subjectum → renewed narration
//
// A predicate that the current subject's narration invoked but could not
// explain is raised into the position of subject. That operation — incipit
// subjectum — is what makes each pivot feel surprising in content and
// retrospectively necessary in form.

export type SubjectType =
  | "event"
  | "technology"
  | "discourse"
  | "person"
  | "institution"
  | "movement"
  | "practice"
  | "ritual"
  | "medium"
  | "genre"
  | "concept"
  | "artifact"
  | "social_role"
  | "legal_form"
  | "economic_form"
  | "religious_form"
  | "political_form"
  | "cultural_formation";

export const SUBJECT_TYPES: readonly SubjectType[] = [
  "event", "technology", "discourse", "person", "institution", "movement",
  "practice", "ritual", "medium", "genre", "concept", "artifact",
  "social_role", "legal_form", "economic_form", "religious_form",
  "political_form", "cultural_formation",
] as const;

export interface AudienceProfile {
  targetAgeMin: number;
  targetAgeMax: number;
  requireConcreteAnchor: boolean;
  maxAbstractClustersInSequence: number;
}

export interface AttentionProgram {
  rawText: string;
  salienceTerms: Array<{ term: string; weight: number }>;
  preferredHistoricalRelations: BurkeQuestion[];
  preferredSubjectTypes: SubjectType[];
  desiredTensions: string[];
  avoidPatterns: string[];
  audienceProfile: AudienceProfile;
}

export interface PageReference {
  title: string;
  url: string;
  reason: string;
  score: number;
}

export interface SeedRegion {
  rawInput: string;
  resolvedPages: PageReference[];
  fixedNarrativeEndpoint: boolean;
  endpointRevisions: Array<{
    proposedSubject: string;
    justification: string;
    accepted: boolean;
  }>;
}

/** A subject: what organizes a cluster as a narratable historical object. */
export interface Subject {
  id: string;
  label: string;
  type: SubjectType;
  /** Null when the subject is synthesized across pages. */
  centralPageTitle: string | null;
  synthesized: boolean;
  /** Pages that warrant the subject — required, especially when synthesized. */
  constitutivePages: string[];
  peripheralPages: string[];
  audienceAnchor: string;
}

export type PredicateType =
  | "precondition"
  | "problem"
  | "selection"
  | "transformation"
  | "analogy"
  | "recoding"
  | "institutional_function"
  | "technical_affordance"
  | "discursive_condition"
  | "social_role"
  | "unintended_consequence";

/** A determination unfolded in a subject's narration. */
/** What an account depends on, versus what it cites for colour. */
export type PredicateRole = "constitutive" | "illustrative";

export interface NarratedPredicate {
  id: string;
  text: string;
  predicateType: PredicateType;
  role: PredicateRole;
  supportPages: string[];
  supportStrength: number;
  explanatoryCompleteness: number;
  importanceToSubject: number;
  /** How likely this predicate is to become the next subject. */
  nextSubjectPotential: number;
}

export type DeficiencyType =
  | "origin_unexplained"
  | "mechanism_unexplained"
  | "selection_unexplained"
  | "transformation_unexplained"
  | "concept_unexplained"
  | "institution_unexplained"
  | "medium_unexplained"
  | "actor_unexplained"
  | "consequence_unexplained"
  | "relation_unexplained";

/** "Subject A helps explain X, but does not yet explain Y." */
export interface ExplanatoryDeficiency {
  id: string;
  subjectId: string;
  predicateId: string;
  deficiencyStatement: string;
  deficiencyType: DeficiencyType;
  whyItMatters: string;
  /** Terms that will condition the next stochastic sampling cycle. */
  impliedSearchDomain: string[];
  impliedSubjectTypes: SubjectType[];
  narrativePressure: number;
  historicalDepthPotential: number;
  audiencePotential: number;
  status:
    | "open"
    | "cluster_searching"
    | "subject_found"
    | "resolved"
    | "deferred"
    | "abandoned";
}

/** The compact account of a subject, from which predicates are extracted. */
export interface SubjectNarrationModel {
  subjectId: string;
  subjectLabel: string;
  subjectType: SubjectType;
  narrativeClaim: string;
  account: string;
  predicates: NarratedPredicate[];
  deficiencies: ExplanatoryDeficiency[];
  strongestDeficiencyId: string | null;
  provisionalClosingSentence: string;
}

/**
 * The transition operation: a predicate of the previous narration becomes
 * the subject of the next. The bridge must recall a determination already
 * introduced, identify what remains unexplained about it, raise it into a
 * question, and introduce the new subject as where it acquires substance.
 */
export interface IncipitSubjectum {
  previousSubjectId: string;
  previousNarrationExcerpt: string;
  predicateId: string;
  predicateAsPreviouslyNarrated: string;
  deficiencyId: string;
  deficiencyStatement: string;
  newSubjectId: string;
  newSubjectLabel: string;
  /** How the new subject emerges from a predicate already unfolded. */
  subjectEmergenceExplanation: string;
  /** Stated precisely, or the pivot is rejected. */
  whyLatentInPreviousNarration: string;
  pivotType: BurkeQuestion;
  /**
   * How the NEW subject still answers the seed's question. Latency is
   * necessary and not sufficient: an example mentioned in passing is
   * genuinely latent in the previous narration, and pivoting into it is
   * how a route wanders into its own scenery.
   */
  seedQuestionRelation: string;
  seedFidelity: number;
  archivalSupport: string[];
  narrativeBridge: string;
  evidentiaryStatus: EvidenceStatus;
  confidence: number;
}

export interface CandidateClusterScores {
  deficiencyFit: number;
  subjectEmergencePotential: number;
  clusterStability: number;
  complementarity: number;
  historicalSpecificity: number;
  immanentTransitionStrength: number;
  narrativePivotPotential: number;
  personalizedRelevance: number;
  audienceIntelligibility: number;
  concreteAnchorStrength: number;
  attentionProgramFit: number;
  surprise: number;
  endpointReturnPotential: number;
  genericAbstraction: number;
  weakDeficiencyRelation: number;
  semanticRedundancy: number;
  forcedHistoricalRelation: number;
  listPageArtifact: number;
  sensationalDetour: number;
  excessiveObscurity: number;
}

export interface SubjectScores {
  deficiencyResolution: number;
  clusterRepresentativeness: number;
  predicateInstantiation: number;
  narrativeSubjecthood: number;
  historicalSpecificity: number;
  immanentPivotStrength: number;
  bridgeCapacity: number;
  audienceIntelligibility: number;
  archivalSupport: number;
  concreteScenePotential: number;
  attentionProgramFit: number;
  genericAbstraction: number;
  merelyAssociativeRelation: number;
  forcedCausality: number;
  clusterMisrepresentation: number;
  excessiveObscurity: number;
}

export interface DeficiencyScores {
  importanceToCurrentSubject: number;
  narrativePressure: number;
  historicalDepthPotential: number;
  capacityToGenerateConcreteSubject: number;
  relationToSeed: number;
  attentionProgramFit: number;
  audiencePotential: number;
  surprisePotential: number;
  genericness: number;
  redundancy: number;
  excessiveAbstraction: number;
  weakArchivalSearchability: number;
}

export interface InterpretedCluster {
  clusterId: string;
  subject: Subject | null;
  scores: CandidateClusterScores;
  /** Weighted total, computed by the engine rather than the model. */
  total: number;
  subjectScores: SubjectScores | null;
  subjectTotal: number;
  whyThisSubjectOrganizesTheCluster: string;
  rejectionReason: string | null;
}

export interface AcceptedSubjectCluster {
  subject: Subject;
  clusterId: string;
  packet: ClusterPacket;
  narration: SubjectNarrationModel | null;
  /** Cluster stability across resampling iterations. */
  stability: number;
  discoveryIndex: number;
}

export interface SubjectTransition {
  fromSubjectId: string;
  toSubjectId: string;
  incipit: IncipitSubjectum;
}

export interface SamplingCycleRecord {
  cycle: number;
  originTitles: string[];
  deficiencyId: string | null;
  deficiencyStatement: string | null;
  episodes: WalkEpisode[];
  nodesSampled: number;
  edgesBuilt: number;
  clustering: ClusteringResult;
  interpreted: InterpretedCluster[];
  chosenClusterId: string | null;
  requestsUsed: number;
}

export interface BudgetUsage {
  sampledPages: number;
  edges: number;
  walkEpisodes: number;
  clusterCycles: number;
  modelCalls: number;
  httpRequests: number;
}

export interface WrapAround {
  everydaySceneTitle: string;
  everydayScene: string;
  /** The predicate the ordinary description cannot explain. */
  latentPredicate: string;
  initialDeficiency: string;
  firstPresentedSubjectId: string;
  /** The introduction performs the same incipit-subjectum transition. */
  bridgeIntoFirstSubject: string;
}

export interface BurkeClusterNarrative {
  title: string;
  opening: string;
  movements: Array<{
    subjectId: string;
    subjectLabel: string;
    prose: string;
    /** Transition into the NEXT movement, in presentation order. */
    pivotProse: string | null;
  }>;
  returnToSeed: string;
  culmination: string;
  orderingRationale: string;
  ledger: Array<{ claim: string; status: EvidenceStatus }>;
}

export interface BurkeClusterState {
  seed: SeedRegion;
  attention: AttentionProgram;
  currentSubject: Subject | null;
  acceptedClusters: AcceptedSubjectCluster[];
  transitions: SubjectTransition[];
  rejectedClusters: Array<{ clusterId: string; reason: string }>;
  rejectedSubjects: Array<{ label: string; reason: string }>;
  cycles: SamplingCycleRecord[];
  /** Discovery order, historical-dependency order, presentation order. */
  discoveryOrder: string[];
  dependencyOrder: string[];
  presentationOrder: string[];
  wrapAround: WrapAround | null;
  budget: BudgetUsage;
}

export type BurkeClusterEndReason =
  | "SUBJECT_SEQUENCE_COMPLETE"
  | "DIMINISHING_RETURNS"
  | "NO_CLUSTER_BEARS_DEFICIENCY"
  | "SUBJECT_DEPTH_REACHED"
  | "BUDGET_EXHAUSTED"
  | "REQUEST_BUDGET_EXHAUSTED";

export interface BurkeClusterResult {
  state: BurkeClusterState;
  narrative: BurkeClusterNarrative | null;
  /** The required transition table; a route with gaps here is rejected. */
  transitionTable: Array<{
    previousSubject: string;
    predicateIntroduced: string;
    deficiency: string;
    newSubject: string;
    whyLatent: string;
    pivotEvidence: string;
    confidence: number;
  }>;
  /** Sampled archive of the final cycle, for the graph view. */
  finalNodes: ArchiveNode[];
  finalEdges: ArchiveEdge[];
  endReason: BurkeClusterEndReason;
  requestsUsed: number;
}

/** The judgment faculty. Measurements advise; these calls decide. */
export interface BurkeClusterOracle {
  /** Build a seed region and a structured attention program. */
  resolveSeed(input: {
    rawSeed: string;
    attentionText: string;
    candidates: Array<{ title: string; summary: string }>;
  }): Promise<{
    seedPages: PageReference[];
    attention: AttentionProgram;
    seedSubject: Subject;
  }>;

  /** Narrate a subject, extract its predicates, and expose its deficiencies. */
  narrate(input: {
    subject: Subject;
    packet: ClusterPacket | null;
    passages: Array<{ title: string; summary: string }>;
    attention: AttentionProgram;
    seedLabel: string;
  }): Promise<SubjectNarrationModel>;

  /** Rank deficiencies and pick the one that will direct the next sampling. */
  selectDeficiency(input: {
    narration: SubjectNarrationModel;
    attention: AttentionProgram;
    seedLabel: string;
    alreadyDiscovered: string[];
  }): Promise<{
    deficiencyId: string;
    scores: DeficiencyScores;
    reasoning: string;
    searchTerms: string[];
  }>;

  /** Interpret each candidate cluster as a possible bearer of the deficiency. */
  interpretClusters(input: {
    packets: ClusterPacket[];
    deficiency: ExplanatoryDeficiency;
    currentSubject: Subject;
    narration: SubjectNarrationModel;
    attention: AttentionProgram;
    alreadyDiscovered: string[];
  }): Promise<InterpretedCluster[]>;

  /** Write the incipit-subjectum transition into the chosen subject. */
  incipit(input: {
    previousSubject: Subject;
    narration: SubjectNarrationModel;
    deficiency: ExplanatoryDeficiency;
    newSubject: Subject;
    packet: ClusterPacket;
    /**
     * The seed, passed explicitly. Without it the gate that asks how a
     * pivot still answers the seed was answered against the PREVIOUS
     * subject — the model inferred a seed from what it could see, scored
     * 0.85 fidelity to that, and a route seeded on the meaning of life
     * walked to cognitive behavioural therapy through eight such steps.
     */
    seedSubject: Subject;
    rawSeed: string;
  }): Promise<IncipitSubjectum>;

  /** The reverse-engineered opening, itself an incipit-subjectum move. */
  wrapAround(input: {
    seedSubject: Subject;
    seedNarration: SubjectNarrationModel | null;
    firstPresentedSubject: Subject;
    accepted: AcceptedSubjectCluster[];
    attention: AttentionProgram;
  }): Promise<WrapAround>;

  /** Compose in presentation order, culminating in the seed. */
  compose(input: {
    state: BurkeClusterState;
    presentationOrder: Subject[];
    transitions: SubjectTransition[];
    wrapAround: WrapAround;
  }): Promise<BurkeClusterNarrative>;
}
