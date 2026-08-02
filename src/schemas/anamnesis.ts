import { z } from "zod";

// Zod schemas for every structured output the anamnesis oracle produces.
// Validated by the provider: invalid output is retried once with the errors,
// then fails visibly with the raw response preserved.

// Mirrors EvidenceStatus in src/domain/explanation/types.ts; spelled out
// here so Zod infers the literal union rather than widening to string.
const evidenceStatusSchema = z.enum([
  "documented transmission",
  "historical precondition",
  "institutional relation",
  "shared condition",
  "structural analogy",
  "speculative resonance",
]);

const anchorSchema = z.object({
  description: z.string().min(1),
  kind: z.enum([
    "scene",
    "object",
    "person",
    "procedure",
    "institution",
    "image",
  ]),
  sourceTitle: z.string().min(1),
});

const chargeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["lexical", "claim", "affective", "structural"]),
  fragment: z.string().min(1),
  whatItAsserts: z.string().min(1),
  weight: z.number().min(0).max(1),
});

const debtSchema = z.object({
  id: z.string().min(1),
  chargeId: z.string().min(1),
  statement: z.string().min(1),
  debtType: z.enum([
    "unfamiliar_term",
    "unearned_claim",
    "missing_precedent",
    "absent_contrast",
    "unfelt_stakes",
    "unmarked_irony",
    "assumed_institution",
    "assumed_mechanism",
  ]),
  priority: z.number().min(0).max(1),
  status: z.enum([
    "unpaid",
    "partially_paid",
    "paid",
    "reframed",
    "abandoned",
  ]),
  paidBy: z.array(z.string()).default([]),
  residue: z.string().nullable(),
});

export const decompositionSchema = z.object({
  charges: z.array(chargeSchema).min(2).max(8),
  debts: z.array(debtSchema).min(3).max(9),
  initialGloss: z.string().min(1),
});

export const debtSelectionSchema = z.object({
  debtId: z.string().min(1),
  reasoning: z.string().min(1),
  searchQuestion: z.string().min(1),
  searchPhrases: z.array(z.string()).min(1).max(6),
});

const mediationScoresSchema = z.object({
  debtPaymentPotential: z.number().min(0).max(1),
  concreteAnchorStrength: z.number().min(0).max(1),
  historicalSpecificity: z.number().min(0).max(1),
  affectiveCharge: z.number().min(0).max(1),
  preparesLaterCharges: z.number().min(0).max(1),
  archivalWarrant: z.number().min(0).max(1),
  novelty: z.number().min(0).max(1),
  registerFit: z.number().min(0).max(1),
  sourceQuality: z.number().min(0).max(1),
  restatesWithoutEarning: z.number().min(0).max(1),
  abstractionWithoutAnchor: z.number().min(0).max(1),
  redundancy: z.number().min(0).max(1),
  sentimentality: z.number().min(0).max(1),
  anachronism: z.number().min(0).max(1),
  decorativeDetour: z.number().min(0).max(1),
});

export const assessmentsSchema = z.object({
  assessments: z
    .array(
      z.object({
        title: z.string().min(1),
        scores: mediationScoresSchema,
        evidenceStatus: evidenceStatusSchema,
        predictedPayment: z.string(),
        proposedAnchor: z.string(),
        rationale: z.string(),
      }),
    )
    .min(1),
});

export const gateSchema = z.object({
  debtId: z.string().min(1),
  paysDebt: z.boolean(),
  paymentCompleteness: z.enum(["full", "partial", "none"]),
  residue: z.string().nullable(),
  suppliesConcreteAnchor: z.boolean(),
  anchor: anchorSchema.nullable(),
  earnsRatherThanRestates: z.boolean(),
  transformedUnderstanding: z.string().min(1),
  evidenceStatus: evidenceStatusSchema,
  verdict: z.enum(["accept", "reject"]),
  rejectionReason: z.string().nullable(),
  bridge: z
    .object({
      unresolvedByPrevious: z.string().min(1),
      whyNext: z.string().min(1),
      standsAlone: z.boolean(),
    })
    .nullable(),
});

export const integrationSchema = z.object({
  whatItSupplies: z.string().min(1),
  howItPays: z.string().min(1),
  anchor: anchorSchema,
  transformedUnderstanding: z.string().min(1),
  evidenceStatus: evidenceStatusSchema,
  residue: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  debtStatus: z.enum([
    "unpaid",
    "partially_paid",
    "paid",
    "reframed",
    "abandoned",
  ]),
  gloss: z.object({
    gloss: z.string().min(1),
    whatChanged: z.string().min(1),
  }),
  newDebts: z.array(debtSchema).max(4).default([]),
});

export const recollectionSchema = z.object({
  rereading: z.string().min(1),
  whatNowLands: z.array(z.string()).default([]),
  whatStillFallsFlat: z.array(z.string()).default([]),
  inhabitabilityScore: z.number().min(0).max(1),
  inhabitable: z.boolean(),
});

export const compositionSchema = z.object({
  opening: z.string().min(1),
  movements: z
    .array(
      z.object({
        title: z.string().min(1),
        preparesWhat: z.string().min(1),
        prose: z.string().min(1),
      }),
    )
    .min(1),
  orderingRationale: z.string().min(1),
  approach: z.string().min(1),
  terminalSentence: z.string().min(1),
  whatRemainsUnearned: z.string().min(1),
  ledger: z
    .array(
      z.object({
        claim: z.string().min(1),
        status: evidenceStatusSchema,
      }),
    )
    .default([]),
});
