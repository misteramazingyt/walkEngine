import { z } from "zod";
import { BURKE_QUESTIONS } from "@/domain/enums";

// Zod schemas for every structured output the Burke oracle produces. All
// LLM responses are validated through these — on failure the provider
// retries once with the validation errors, then fails visibly.

export const salienceSchema = z.object({
  weights: z
    .array(
      z.object({
        term: z.string().min(1),
        weight: z.number().min(1).max(3),
      }),
    )
    .min(3)
    .max(16),
});

export const candidateJudgmentSchema = z.object({
  title: z.string().min(1),
  novelty: z.number().min(0).max(1),
  historicalDepth: z.number().min(0).max(1),
  narrativeTension: z.number().min(0).max(1),
  conceptualFit: z.number().min(0).max(1),
  explanatoryGain: z.number().min(0).max(1),
  returnPotential: z.number().min(0).max(1),
  discarded: z.boolean(),
  rationale: z.string(),
});

export const stepDecisionSchema = z.object({
  judgments: z.array(candidateJudgmentSchema).min(1),
  chosenTitle: z.string().min(1),
  question: z.enum(BURKE_QUESTIONS),
  observation: z.string().min(1),
  changedUnderstanding: z.string().min(1),
  returnToSeed: z.string().min(1),
  redescriptionAchieved: z.boolean(),
});

export const elasticitySchema = z.object({
  story: z.string().min(1),
  changedSubstantially: z.boolean(),
  rationale: z.string().min(1),
});

export const recodingSchema = z.object({
  redescription: z.string().min(1),
});
