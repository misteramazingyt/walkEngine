import { z } from "zod";
import {
  ANAMNETIC_REGISTERS,
  CONSCIOUSNESS_CONTROLS,
  CRITERIA,
  ENDPOINT_STRATEGIES,
  SAMPLING_MODES,
  START_KINDS,
  WALK_MODES,
} from "@/domain/enums";

const criteriaWeightsSchema = z.object(
  Object.fromEntries(
    CRITERIA.map((c) => [c, z.number().min(0).max(5).default(0)]),
  ) as Record<(typeof CRITERIA)[number], z.ZodDefault<z.ZodNumber>>,
);

const consciousnessSchema = z.object(
  Object.fromEntries(
    CONSCIOUSNESS_CONTROLS.map((c) => [c, z.boolean()]),
  ) as Record<(typeof CONSCIOUSNESS_CONTROLS)[number], z.ZodBoolean>,
);

export const CONSCIOUSNESS_DEFAULTS: z.infer<typeof consciousnessSchema> = {
  actorHorizon: true,
  contemporaryRivalHorizon: false,
  laterCanonicalInterpretation: true,
  presentDayInheritedMotif: true,
  immanentCritique: true,
  newMotifDiscovery: false,
};

export const walkConfigurationSchema = z.object({
  walkMode: z.enum(WALK_MODES).default("RANDOM"),

  start: z
    .object({
      kind: z.enum(START_KINDS).default("RANDOM"),
      value: z.string().default(""),
    })
    .default({ kind: "RANDOM", value: "" }),

  endpointStrategy: z.enum(ENDPOINT_STRATEGIES).default("WALK_FINAL"),
  specifiedEndpoint: z.string().default(""),

  walkLength: z.number().int().min(2).max(100).default(12),
  branchFactor: z.number().int().min(1).max(200).default(20),
  maxGraphRequests: z.number().int().min(1).max(2000).default(150),
  language: z.string().min(2).max(12).default("en"),
  seed: z.string().min(1).default("motif-walk"),
  allowRevisits: z.boolean().default(false),
  excludeMetaPages: z.boolean().default(true),
  minArticleLength: z.number().int().min(0).default(0),
  maxPopularityPercentile: z.number().min(0).max(100).default(100),
  temporalBounds: z
    .object({
      // Years; negative = BCE. Null = unbounded.
      start: z.number().int().nullable().default(null),
      end: z.number().int().nullable().default(null),
    })
    .default({ start: null, end: null }),
  geographicBounds: z.string().default(""),

  criteriaWeights: criteriaWeightsSchema.default(
    Object.fromEntries(CRITERIA.map((c) => [c, 0])) as Record<
      (typeof CRITERIA)[number],
      number
    >,
  ),
  pathDescription: z.string().default(""),
  samplingMode: z.enum(SAMPLING_MODES).default("WEIGHTED"),

  historicalConsciousness: consciousnessSchema.default(CONSCIOUSNESS_DEFAULTS),

  draftTargetWords: z
    .object({
      min: z.number().int().min(200).default(1800),
      max: z.number().int().min(200).default(2500),
    })
    .refine((v) => v.min <= v.max, {
      message: "draftTargetWords.min must not exceed max",
    })
    .default({ min: 1800, max: 2500 }),

  // BurkeWalker: a curiosity program, not a weight vector. The seed is the
  // user's lived experience; priming is a field of salience, not a thesis.
  burke: z
    .object({
      seedKind: z.enum(["OBJECT", "QUESTION"]).default("OBJECT"),
      seedText: z.string().default(""),
      priming: z.string().default(""),
      /** Name of a preset motif module, or "" for none. */
      motif: z.string().default(""),
      /** Theory-checkpoint cadence in accepted nodes (Burke's 5–10 rule). */
      elasticityInterval: z.number().int().min(3).max(20).default(6),
      /** Safety cap — the real stopping condition is redescription. */
      maxPages: z.number().int().min(3).max(40).default(12),
      /** No node may be accepted without a credible narrative bridge. */
      requireMotivatedTransitions: z.boolean().default(true),
      /** 0 = documented dependencies only; 1 = morphology allowed (labeled). */
      analogyTolerance: z.number().min(0).max(1).default(0.25),
      /** Permit detours that open a question returning to the thread. */
      allowProductiveDetours: z.boolean().default(false),
    })
    .default({
      seedKind: "OBJECT",
      seedText: "",
      priming: "",
      motif: "",
      elasticityInterval: 6,
      maxPages: 12,
      requireMotivatedTransitions: true,
      analogyTolerance: 0.25,
      allowProductiveDetours: false,
    }),

  // Anamnesis: the walk begins from a felt ending and searches for the
  // mediations that would make it inhabitable.
  anamnesis: z
    .object({
      /** The sentence the composition must arrive at, verbatim. */
      terminalSentence: z.string().default(""),
      register: z.enum(ANAMNETIC_REGISTERS).default("recognition"),
      /** Optional gloss of what the author means by it. */
      intent: z.string().default(""),
      /** Who the reader is assumed to be. */
      audienceNote: z.string().default(""),
      /** Re-read the sentence every N accepted mediations. */
      recollectionInterval: z.number().int().min(1).max(10).default(3),
      /** Safety cap — the real stopping condition is inhabitability. */
      maxMediations: z.number().int().min(3).max(30).default(9),
      requireMotivatedTransitions: z.boolean().default(true),
      /** Every mediation must supply something the reader can picture. */
      requireConcreteAnchors: z.boolean().default(true),
      /** 0 = austere; 1 = more affective material (never unpenalized). */
      sentimentalityTolerance: z.number().min(0).max(1).default(0.2),
    })
    .default({
      terminalSentence: "",
      register: "recognition",
      intent: "",
      audienceNote: "",
      recollectionInterval: 3,
      maxMediations: 9,
      requireMotivatedTransitions: true,
      requireConcreteAnchors: true,
      sentimentalityTolerance: 0.2,
    }),

  // BurkeCluster: stochastic subject discovery. The seed is the provisional
  // ENDING; the walk samples outward and discovers subject-regions backward.
  burkeCluster: z
    .object({
      seedText: z.string().default(""),
      attentionProgram: z.string().default(""),
      minimumSubjectCount: z.number().int().min(1).max(8).default(3),
      maxSubjectDepth: z.number().int().min(1).max(10).default(4),
      // Sampling
      episodesPerCycle: z.number().int().min(2).max(40).default(10),
      hopsPerEpisode: z.number().int().min(1).max(12).default(4),
      restartProbability: z.number().min(0).max(0.9).default(0.15),
      maxNodesPerCycle: z.number().int().min(20).max(400).default(120),
      maxEdgesPerCycle: z.number().int().min(50).max(6000).default(1500),
      secondOrderFanout: z.number().int().min(0).max(40).default(14),
      sharedNeighborThreshold: z.number().int().min(1).max(6).default(2),
      minClusterSize: z.number().int().min(2).max(12).default(3),
      // Judgment
      analogyTolerance: z.number().min(0).max(1).default(0.25),
      /** How firmly the seed stays the ending; 1 = never revisable. */
      endpointRigidity: z.number().min(0).max(1).default(0.9),
      requireConcreteAnchor: z.boolean().default(true),
      // Budgets — exhaustion is reported distinctly from completion.
      maxClusterCycles: z.number().int().min(1).max(20).default(8),
      maxModelCalls: z.number().int().min(5).max(120).default(45),
    })
    .default({
      seedText: "",
      attentionProgram: "",
      minimumSubjectCount: 3,
      maxSubjectDepth: 4,
      episodesPerCycle: 10,
      hopsPerEpisode: 4,
      restartProbability: 0.15,
      maxNodesPerCycle: 120,
      maxEdgesPerCycle: 1500,
      secondOrderFanout: 14,
      sharedNeighborThreshold: 2,
      minClusterSize: 3,
      analogyTolerance: 0.25,
      endpointRigidity: 0.9,
      requireConcreteAnchor: true,
      maxClusterCycles: 8,
      maxModelCalls: 45,
    }),
});

export type WalkConfiguration = z.infer<typeof walkConfigurationSchema>;

/** A fully-defaulted configuration for new projects. */
export function defaultWalkConfiguration(): WalkConfiguration {
  return walkConfigurationSchema.parse({});
}
