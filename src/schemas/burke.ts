import { z } from "zod";
import { BURKE_QUESTIONS } from "@/domain/enums";

// Zod schemas for every structured output the Burke oracle produces. All
// LLM responses are validated through these — on failure the provider
// retries once with the validation errors, then fails visibly.

const evidenceStatusSchema = z.enum([
  "documented transmission",
  "historical precondition",
  "institutional relation",
  "shared condition",
  "structural analogy",
  "speculative resonance",
]);

export const curiosityProgramSchema = z.object({
  seedAssumption: z.string().min(1),
  mattersOfConcern: z.array(z.string()).min(1).max(12),
  preferredMechanisms: z.array(z.string()).max(12).default([]),
  preferredHistoricalRelations: z.array(z.string()).max(8).default([]),
  desiredTensions: z.array(z.string()).max(8).default([]),
  suspectedGenealogies: z.array(z.string()).max(8).default([]),
  comparisonDimensions: z.array(z.string()).max(8).default([]),
  avoidPatterns: z.array(z.string()).max(12).default([]),
  sourceDomainPreferences: z.array(z.string()).max(8).default([]),
  temporalPreferences: z.array(z.string()).max(6).default([]),
  geographicPreferences: z.array(z.string()).max(6).default([]),
  narrativeVoice: z.string().default("public-facing, intellectually exact"),
  riskTolerance: z.number().min(0).max(1).default(0.5),
  analogyTolerance: z.number().min(0).max(1).default(0.3),
  causalityThreshold: z.number().min(0).max(1).default(0.5),
  surpriseWeight: z.number().min(0).max(1).default(0.4),
  historicalDepthWeight: z.number().min(0).max(1).default(0.7),
  preferredNavigationQuestions: z.array(z.string()).max(10).default([]),
});

const unresolvedQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  questionType: z.enum(BURKE_QUESTIONS),
  priority: z.number().min(0).max(1),
  originStep: z.number().int().min(0),
  status: z.enum(["open", "answered", "reframed", "abandoned"]),
  answerSummary: z.string().nullable(),
});

const mysterySchema = z.object({
  originalMystery: z.string().min(1),
  currentMystery: z.string().min(1),
  mysteryScore: z.number().min(0).max(1),
  productiveComplications: z.array(z.string()).default([]),
  resolvedComponents: z.array(z.string()).default([]),
});

export const initializationSchema = z.object({
  curiosityProgram: curiosityProgramSchema,
  provisionalTheory: z.string().min(1),
  unresolvedQuestions: z.array(unresolvedQuestionSchema).min(3).max(7),
  unexplainedRemainder: z.array(z.string()).min(1).max(8),
  currentTension: z.string().min(1),
  mystery: mysterySchema,
});

export const diagnosisSchema = z.object({
  deficiency: z.string().min(1),
  questionId: z.string().nullable(),
  burkeQuestion: z.enum(BURKE_QUESTIONS),
  navigationQuestion: z.string().min(1),
  searchPhrases: z.array(z.string()).min(1).max(6),
});

const candidateScoresSchema = z.object({
  questionAnsweringPotential: z.number().min(0).max(1),
  theoryRevisionPotential: z.number().min(0).max(1),
  historicalDependencyStrength: z.number().min(0).max(1),
  narrativeTensionGain: z.number().min(0).max(1),
  causalOrInstitutionalSpecificity: z.number().min(0).max(1),
  novelty: z.number().min(0).max(1),
  returnPotential: z.number().min(0).max(1),
  curiosityProgramFit: z.number().min(0).max(1),
  sourceQuality: z.number().min(0).max(1),
  lexicalSimilarityWithoutExplanatoryGain: z.number().min(0).max(1),
  analogyOnlyPenalty: z.number().min(0).max(1),
  redundancy: z.number().min(0).max(1),
  genericAbstractionPenalty: z.number().min(0).max(1),
  sensationalDetourPenalty: z.number().min(0).max(1),
  seedForcingPenalty: z.number().min(0).max(1),
});

export const assessmentsSchema = z.object({
  assessments: z
    .array(
      z.object({
        title: z.string().min(1),
        scores: candidateScoresSchema,
        relationType: evidenceStatusSchema,
        analogyCarrier: z.string().nullable(),
        predictedClaim: z.string(),
        predictedTheoryRevision: z.string(),
        rationale: z.string(),
      }),
    )
    .min(1),
});

export const gateSchema = z.object({
  addressedQuestionId: z.string().nullable(),
  claimEstablished: z.string().min(1),
  howTheoryChanges: z.string().min(1),
  contributionKind: z.enum([
    "dependency",
    "mechanism",
    "contrast",
    "transformation",
    "none",
  ]),
  strongerThanResemblance: z.boolean(),
  followingQuestion: z.string().min(1),
  answersHighPriorityQuestion: z.boolean(),
  invalidatesPartOfTheory: z.boolean(),
  revealsDeeperPrecondition: z.boolean(),
  introducesConsequentialAlternative: z.boolean(),
  createsStrongerNarrativePivot: z.boolean(),
  enablesImprovedRecoding: z.boolean(),
  verdict: z.enum(["accept", "reject"]),
  rejectionReason: z.string().nullable(),
  bridge: z
    .object({
      unexplainedByPrevious: z.string().min(1),
      whyNext: z.string().min(1),
      standsWithoutSeed: z.boolean(),
    })
    .nullable(),
});

export const revisionSchema = z.object({
  theory: z.string().min(1),
  changeType: z.enum([
    "additive",
    "corrective",
    "substitutive",
    "reframing",
  ]),
  supersedes: z.string().nullable(),
  whatChanged: z.string().min(1),
  whyItChanged: z.string().min(1),
  confidence: z.number().min(0).max(1),
  note: z.object({
    whyChosen: z.string().min(1),
    relevantEvidence: z.string().min(1),
    claimEstablishedOrChallenged: z.string().min(1),
    narrativePivot: z.string().min(1),
    newUnresolvedQuestion: z.string().min(1),
    seedRelation: z.enum(["direct", "deferred", "uncertain"]),
    evidenceStatus: evidenceStatusSchema,
    analogyCarrier: z.string().nullable(),
    confidence: z.number().min(0).max(1),
  }),
  questionUpdates: z
    .array(
      z.object({
        id: z.string().min(1),
        status: z.enum(["open", "answered", "reframed", "abandoned"]),
        answerSummary: z.string().nullable(),
      }),
    )
    .default([]),
  newQuestions: z.array(unresolvedQuestionSchema).max(4).default([]),
  claims: z
    .array(
      z.object({
        claim: z.string().min(1),
        supportNodeTitles: z.array(z.string()).default([]),
        confidence: z.number().min(0).max(1),
      }),
    )
    .default([]),
  mystery: mysterySchema,
  currentTension: z.string().min(1),
  returnPaths: z
    .array(
      z.object({
        nodeTitle: z.string().min(1),
        possibleRecode: z.string().min(1),
        strength: z.number().min(0).max(1),
      }),
    )
    .default([]),
});

export const checkpointSchema = z.object({
  previousTheory: z.string(),
  revisedTheory: z.string().min(1),
  decisiveDiscoveries: z.array(z.string()).default([]),
  whatRemainsUnexplained: z.string().min(1),
  strongestTension: z.string().min(1),
  nextBestQuestion: z.string().min(1),
  changeClass: z.enum([
    "none",
    "minor elaboration",
    "meaningful refinement",
    "major reframing",
    "reversal",
  ]),
});

export const coherenceSchema = z.object({
  transitionsExplainableWithoutSeed: z.boolean(),
  eachNodeArisesFromPriorDeficiency: z.boolean(),
  accumulatingMechanismsNotExamples: z.boolean(),
  governingQuestionChangedIntelligibly: z.boolean(),
  removableNodes: z.array(z.string()).default([]),
  duplicateFunctionNodes: z.array(z.string()).default([]),
  sensationalHijack: z.boolean(),
  movesBackwardThenForward: z.boolean(),
  theoryDiffersFromInitial: z.boolean(),
  score: z.number().min(0).max(1),
  diagnosis: z.string().min(1),
});

export const narrativeSchema = z.object({
  hook: z.string().min(1),
  initialApparentAnswer: z.string().min(1),
  firstContradiction: z.string().min(1),
  pivots: z
    .array(
      z.object({
        title: z.string().min(1),
        motivation: z.string().min(1),
        development: z.string().min(1),
      }),
    )
    .default([]),
  reversals: z.array(z.string()).default([]),
  returnToSeed: z.string().min(1),
  remainingUncertainty: z.string().min(1),
  evidenceLedger: z
    .array(
      z.object({
        claim: z.string().min(1),
        status: evidenceStatusSchema,
      }),
    )
    .default([]),
});
