import { z } from "zod";
import { BURKE_QUESTIONS } from "@/domain/enums";
import { SUBJECT_TYPES } from "@/domain/burkecluster/types";

// Zod schemas for every structured output the BurkeCluster oracle produces.

const evidenceStatusSchema = z.enum([
  "documented transmission",
  "historical precondition",
  "institutional relation",
  "shared condition",
  "structural analogy",
  "speculative resonance",
]);

const subjectTypeSchema = z.enum(
  SUBJECT_TYPES as unknown as [string, ...string[]],
);

const subjectSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: subjectTypeSchema,
  centralPageTitle: z.string().nullable(),
  synthesized: z.boolean(),
  constitutivePages: z.array(z.string()).min(1),
  peripheralPages: z.array(z.string()).default([]),
  audienceAnchor: z.string(),
});

export const seedResolutionSchema = z.object({
  seedPages: z
    .array(
      z.object({
        title: z.string().min(1),
        url: z.string().default(""),
        reason: z.string().min(1),
        score: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(6),
  attention: z.object({
    salienceTerms: z
      .array(z.object({ term: z.string().min(1), weight: z.number().min(0).max(3) }))
      .min(3)
      .max(16),
    preferredHistoricalRelations: z.array(z.enum(BURKE_QUESTIONS)).default([]),
    preferredSubjectTypes: z.array(subjectTypeSchema).default([]),
    desiredTensions: z.array(z.string()).default([]),
    avoidPatterns: z.array(z.string()).default([]),
  }),
  seedSubject: subjectSchema,
});

const predicateSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  predicateType: z.enum([
    "precondition",
    "problem",
    "selection",
    "transformation",
    "analogy",
    "recoding",
    "institutional_function",
    "technical_affordance",
    "discursive_condition",
    "social_role",
    "unintended_consequence",
  ]),
  // Whether the account DEPENDS on this, or merely cites it to be vivid.
  // Chasing an illustration is how a walk seeded on the meaning of life
  // ends up narrating the American Civil War.
  role: z.enum(["constitutive", "illustrative"]).default("constitutive"),
  supportPages: z.array(z.string()).default([]),
  supportStrength: z.number().min(0).max(1),
  explanatoryCompleteness: z.number().min(0).max(1),
  importanceToSubject: z.number().min(0).max(1),
  nextSubjectPotential: z.number().min(0).max(1),
});

const deficiencySchema = z.object({
  id: z.string().min(1),
  predicateId: z.string().min(1),
  deficiencyStatement: z.string().min(1),
  deficiencyType: z.enum([
    "origin_unexplained",
    "mechanism_unexplained",
    "selection_unexplained",
    "transformation_unexplained",
    "concept_unexplained",
    "institution_unexplained",
    "medium_unexplained",
    "actor_unexplained",
    "consequence_unexplained",
    "relation_unexplained",
  ]),
  whyItMatters: z.string().min(1),
  impliedSearchDomain: z.array(z.string()).min(1).max(10),
  impliedSubjectTypes: z.array(subjectTypeSchema).default([]),
  narrativePressure: z.number().min(0).max(1),
  historicalDepthPotential: z.number().min(0).max(1),
  audiencePotential: z.number().min(0).max(1),
});

export const narrationSchema = z.object({
  narrativeClaim: z.string().min(1),
  account: z.string().min(1),
  predicates: z.array(predicateSchema).min(2).max(9),
  deficiencies: z.array(deficiencySchema).min(3).max(7),
  provisionalClosingSentence: z.string().min(1),
});

export const deficiencySelectionSchema = z.object({
  deficiencyId: z.string().min(1),
  scores: z.object({
    importanceToCurrentSubject: z.number().min(0).max(1),
    narrativePressure: z.number().min(0).max(1),
    historicalDepthPotential: z.number().min(0).max(1),
    capacityToGenerateConcreteSubject: z.number().min(0).max(1),
    relationToSeed: z.number().min(0).max(1),
    attentionProgramFit: z.number().min(0).max(1),
    audiencePotential: z.number().min(0).max(1),
    surprisePotential: z.number().min(0).max(1),
    genericness: z.number().min(0).max(1),
    redundancy: z.number().min(0).max(1),
    excessiveAbstraction: z.number().min(0).max(1),
    weakArchivalSearchability: z.number().min(0).max(1),
  }),
  reasoning: z.string().min(1),
  searchTerms: z.array(z.string()).min(1).max(8),
});

const clusterScoresSchema = z.object({
  deficiencyFit: z.number().min(0).max(1),
  subjectEmergencePotential: z.number().min(0).max(1),
  clusterStability: z.number().min(0).max(1),
  complementarity: z.number().min(0).max(1),
  historicalSpecificity: z.number().min(0).max(1),
  immanentTransitionStrength: z.number().min(0).max(1),
  narrativePivotPotential: z.number().min(0).max(1),
  personalizedRelevance: z.number().min(0).max(1),
  audienceIntelligibility: z.number().min(0).max(1),
  concreteAnchorStrength: z.number().min(0).max(1),
  attentionProgramFit: z.number().min(0).max(1),
  surprise: z.number().min(0).max(1),
  endpointReturnPotential: z.number().min(0).max(1),
  genericAbstraction: z.number().min(0).max(1),
  weakDeficiencyRelation: z.number().min(0).max(1),
  semanticRedundancy: z.number().min(0).max(1),
  forcedHistoricalRelation: z.number().min(0).max(1),
  listPageArtifact: z.number().min(0).max(1),
  sensationalDetour: z.number().min(0).max(1),
  excessiveObscurity: z.number().min(0).max(1),
});

const subjectScoresSchema = z.object({
  deficiencyResolution: z.number().min(0).max(1),
  clusterRepresentativeness: z.number().min(0).max(1),
  predicateInstantiation: z.number().min(0).max(1),
  narrativeSubjecthood: z.number().min(0).max(1),
  historicalSpecificity: z.number().min(0).max(1),
  immanentPivotStrength: z.number().min(0).max(1),
  bridgeCapacity: z.number().min(0).max(1),
  audienceIntelligibility: z.number().min(0).max(1),
  archivalSupport: z.number().min(0).max(1),
  concreteScenePotential: z.number().min(0).max(1),
  attentionProgramFit: z.number().min(0).max(1),
  genericAbstraction: z.number().min(0).max(1),
  merelyAssociativeRelation: z.number().min(0).max(1),
  forcedCausality: z.number().min(0).max(1),
  clusterMisrepresentation: z.number().min(0).max(1),
  excessiveObscurity: z.number().min(0).max(1),
});

export const interpretationSchema = z.object({
  interpretations: z
    .array(
      z.object({
        clusterId: z.string().min(1),
        // Absent and null mean the same thing here, and the model omits a
        // key far more readily than it emits an explicit null: an accepted
        // interpretation simply has no rejection reason to give. Requiring
        // the key failed whole walks late, after every request was spent.
        subject: subjectSchema.nullish().default(null),
        scores: clusterScoresSchema,
        subjectScores: subjectScoresSchema.nullish().default(null),
        whyThisSubjectOrganizesTheCluster: z
          .string()
          .nullish()
          .transform((v) => v ?? ""),
        rejectionReason: z.string().nullish().default(null),
      }),
    )
    .min(1),
});

export const incipitSchema = z.object({
  predicateId: z.string().min(1),
  predicateAsPreviouslyNarrated: z.string().min(1),
  previousNarrationExcerpt: z.string().min(1),
  subjectEmergenceExplanation: z.string().min(1),
  whyLatentInPreviousNarration: z.string().min(1),
  /** How the new subject still answers the SEED's question, not merely the
   * current subject's. Without this a route follows its own illustrations. */
  seedQuestionRelation: z.string().default(""),
  seedFidelity: z.number().min(0).max(1).default(0),
  pivotType: z.enum(BURKE_QUESTIONS),
  archivalSupport: z.array(z.string()).default([]),
  narrativeBridge: z.string().min(1),
  evidentiaryStatus: evidenceStatusSchema,
  confidence: z.number().min(0).max(1),
});

export const wrapAroundSchema = z.object({
  everydaySceneTitle: z.string().min(1),
  everydayScene: z.string().min(1),
  latentPredicate: z.string().min(1),
  initialDeficiency: z.string().min(1),
  bridgeIntoFirstSubject: z.string().min(1),
});

export const compositionSchema = z.object({
  title: z.string().min(1),
  opening: z.string().min(1),
  movements: z
    .array(
      z.object({
        subjectId: z.string().min(1),
        subjectLabel: z.string().min(1),
        prose: z.string().min(1),
        pivotProse: z.string().nullable(),
      }),
    )
    .min(1),
  returnToSeed: z.string().min(1),
  culmination: z.string().min(1),
  orderingRationale: z.string().min(1),
  ledger: z
    .array(z.object({ claim: z.string().min(1), status: evidenceStatusSchema }))
    .default([]),
});
