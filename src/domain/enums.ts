// Canonical string-literal vocabularies for the Motif Walk domain.
// Defined as const tuples so both TypeScript unions and Zod enums derive
// from a single source of truth.

export const WALK_MODES = [
  "RANDOM",
  "CRITERIOLOGICAL",
  "BURKE",
  "ANAMNETIC",
] as const;
export type WalkMode = (typeof WALK_MODES)[number];

export const WALK_MODE_LABELS: Record<WalkMode, string> = {
  RANDOM: "Random",
  CRITERIOLOGICAL: "Criteriological",
  BURKE: "Burke — unresolved-question traversal",
  ANAMNETIC: "Anamnetic — start from a felt ending",
};

/** The register a terminal sentence is meant to land in. */
export const ANAMNETIC_REGISTERS = [
  "recognition",
  "vertigo",
  "grief",
  "irony",
  "resolve",
  "unease",
] as const;

// The BurkeWalker's entire recursive question grammar. The walker never
// asks arbitrary questions — it chooses among exactly these six.
export const BURKE_QUESTIONS = [
  "PRECONDITION",
  "PROBLEM",
  "SELECTION",
  "TRANSFORMATION",
  "ANALOGY",
  "RECODING",
] as const;
export type BurkeQuestion = (typeof BURKE_QUESTIONS)[number];

export const BURKE_QUESTION_LABELS: Record<BurkeQuestion, string> = {
  PRECONDITION: "What had to exist already?",
  PROBLEM: "What problem did this solve?",
  SELECTION: "Why this solution?",
  TRANSFORMATION: "What changed afterwards?",
  ANALOGY: "Where else does this structure occur?",
  RECODING: "How should the original object now be redescribed?",
};

// Criteria for moving: every candidate page is judged on these before the
// walker traverses. Return potential is the Burkean one — can this page
// eventually illuminate the seed? If not, discard.
export const BURKE_MOVE_CRITERIA = [
  "novelty",
  "historicalDepth",
  "narrativeTension",
  "conceptualFit",
  "explanatoryGain",
  "returnPotential",
] as const;
export type BurkeMoveCriterion = (typeof BURKE_MOVE_CRITERIA)[number];

export const PROJECT_STATUSES = [
  "DRAFT",
  "WALKING",
  "WALK_READY",
  "ORCHESTRATING",
  "COMPOSED",
  "FAILED",
] as const;
export type WalkProjectStatus = (typeof PROJECT_STATUSES)[number];

export const START_KINDS = ["TITLE", "URL", "TOPIC", "RANDOM"] as const;
export type StartKind = (typeof START_KINDS)[number];

export const ENDPOINT_STRATEGIES = [
  "WALK_FINAL",
  "MANUAL_AFTER_WALK",
  "SPECIFIED_IN_ADVANCE",
  "LLM_SELECTED",
] as const;
export type EndpointStrategy = (typeof ENDPOINT_STRATEGIES)[number];

export const SAMPLING_MODES = ["GREEDY", "WEIGHTED", "EXPLORATORY", "BEAM"] as const;
export type SamplingMode = (typeof SAMPLING_MODES)[number];

// Criteriological scoring criteria, weighted 0–5 by the user.
export const CRITERIA = [
  "documentedInfluence",
  "materialDependency",
  "institutionalContinuity",
  "conceptualInheritance",
  "sharedSocialFunction",
  "rhetoricalRecurrence",
  "commonProblem",
  "unintendedConsequence",
  "motifAffinity",
  "temporalContinuity",
  "geographicContinuity",
  "semanticSimilarity",
  "semanticDistance",
  "visualizability",
  "surprise",
  "evidentiaryStrength",
] as const;
export type Criterion = (typeof CRITERIA)[number];

export const CRITERION_LABELS: Record<Criterion, string> = {
  documentedInfluence: "Documented influence",
  materialDependency: "Material dependency",
  institutionalContinuity: "Institutional continuity",
  conceptualInheritance: "Conceptual inheritance",
  sharedSocialFunction: "Shared social function",
  rhetoricalRecurrence: "Rhetorical or symbolic recurrence",
  commonProblem: "Common problem",
  unintendedConsequence: "Unintended consequence",
  motifAffinity: "Motif affinity",
  temporalContinuity: "Temporal continuity",
  geographicContinuity: "Geographic continuity",
  semanticSimilarity: "Semantic similarity",
  semanticDistance: "Semantic distance",
  visualizability: "Visualizability",
  surprise: "Surprise",
  evidentiaryStrength: "Evidentiary strength",
};

// Historical-consciousness layers the LLM must produce when enabled.
export const CONSCIOUSNESS_CONTROLS = [
  "actorHorizon",
  "contemporaryRivalHorizon",
  "laterCanonicalInterpretation",
  "presentDayInheritedMotif",
  "immanentCritique",
  "newMotifDiscovery",
] as const;
export type ConsciousnessControl = (typeof CONSCIOUSNESS_CONTROLS)[number];

export const CONSCIOUSNESS_LABELS: Record<ConsciousnessControl, string> = {
  actorHorizon: "Actor horizon",
  contemporaryRivalHorizon: "Contemporary rival horizon",
  laterCanonicalInterpretation: "Later canonical interpretation",
  presentDayInheritedMotif: "Present-day inherited motif",
  immanentCritique: "Immanent critique",
  newMotifDiscovery: "New motif discovery",
};

export const NARRATIVE_FUNCTIONS = [
  "OPENING_EFFECT",
  "ENDPOINT",
  "ENABLING_CONDITION",
  "PROBLEM",
  "PROVISIONAL_SOLUTION",
  "UNINTENDED_CONSEQUENCE",
  "ANOMALY",
  "INSTITUTIONAL_RECOMBINATION",
  "RETROSPECTIVE_RECLASSIFICATION",
] as const;
export type NarrativeFunction = (typeof NARRATIVE_FUNCTIONS)[number];

export const EDGE_TYPES = [
  "MATERIAL_DEPENDENCY",
  "DOCUMENTED_INFLUENCE",
  "INSTITUTIONAL_ADOPTION",
  "CONCEPTUAL_INHERITANCE",
  "TRANSLATION",
  "COMMON_PROBLEM",
  "PRACTICAL_EXPOSURE",
  "DELAYED_ACTIVATION",
  "UNINTENDED_CONSEQUENCE",
  "INSTRUMENTAL_REDEPLOYMENT",
  "FUNCTIONAL_ANALOGY",
  "RHETORICAL_RECURRENCE",
  "SYMBOLIC_MOTIF",
  "RETROSPECTIVE_RECLASSIFICATION",
  "SPECULATIVE_ASSOCIATION",
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const WARRANT_CLASSES = [
  "DOCUMENTED_CAUSAL",
  "DOCUMENTED_RECEPTION",
  "DOCUMENTED_COINCIDENCE",
  "STRUCTURAL_ANALOGY",
  "FUNCTIONAL_EQUIVALENCE",
  "INTERPRETIVE_PROPOSAL",
  "SPECULATIVE",
] as const;
export type WarrantClass = (typeof WARRANT_CLASSES)[number];

export const DRAFT_SEGMENT_TYPES = [
  "OPENING",
  "NODE",
  "TRANSITION",
  "RECAP",
  "SELF_REFLEXIVE_ASIDE",
  "ENDING",
] as const;
export type DraftSegmentType = (typeof DRAFT_SEGMENT_TYPES)[number];

export const JOB_STATUSES = ["QUEUED", "RUNNING", "COMPLETE", "FAILED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
