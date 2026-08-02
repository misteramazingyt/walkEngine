import type {
  BurkeNote,
  BurkeOracle,
  BurkeSeed,
  SalienceWeight,
  StepDecision,
} from "@/domain/burke/types";
import type { BurkeQuestion } from "@/domain/enums";
import {
  elasticitySchema,
  recodingSchema,
  salienceSchema,
  stepDecisionSchema,
} from "@/schemas/burke";
import { loadPrompt } from "./prompt-files";
import type { LanguageModelProvider } from "./provider";

// The LLM-backed judgment faculty of the BurkeWalker. All prompts are
// versioned files; all outputs are Zod-validated by the provider.

function seedLine(seed: BurkeSeed): string {
  return `${seed.kind}: "${seed.text}"`;
}

function notesBlock(notes: BurkeNote[], limit = 12): string {
  if (notes.length === 0) return "(no notes yet)";
  return notes
    .slice(-limit)
    .map(
      (n) =>
        `#${n.visitIndex} [${n.articleTitle}] ${n.question}\n  observation: ${n.observation}\n  changed: ${n.changedUnderstanding}\n  return: ${n.returnToSeed}`,
    )
    .join("\n");
}

export class LlmBurkeOracle implements BurkeOracle {
  constructor(private readonly provider: LanguageModelProvider) {}

  async prime(input: {
    seed: BurkeSeed;
    priming: string;
    motifSensitivity: string[];
  }): Promise<SalienceWeight[]> {
    const result = await this.provider.generateStructured({
      promptId: "burke-prime.v1",
      system: loadPrompt("burke-prime.v1"),
      user: [
        `SEED — ${seedLine(input.seed)}`,
        `PRIMING:\n${input.priming || "(none given — derive salience from the seed alone)"}`,
        input.motifSensitivity.length > 0
          ? `MOTIF SENSITIVITY: ${input.motifSensitivity.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: salienceSchema,
    });
    return result.weights;
  }

  async step(input: {
    seed: BurkeSeed;
    salience: SalienceWeight[];
    current: { title: string; summary: string };
    candidates: Array<{ title: string; summary: string }>;
    notesSoFar: BurkeNote[];
    preferredQuestions: BurkeQuestion[];
  }): Promise<StepDecision> {
    const result = await this.provider.generateStructured({
      promptId: "burke-step.v1",
      system: loadPrompt("burke-step.v1"),
      user: [
        `SEED — ${seedLine(input.seed)}`,
        `ATTEND:\n${input.salience.map((s) => `${s.term} ${"+".repeat(Math.round(s.weight))}`).join("\n")}`,
        input.preferredQuestions.length > 0
          ? `PREFERRED QUESTIONS: ${input.preferredQuestions.join(", ")}`
          : "",
        `CURRENT PAGE — ${input.current.title}\n${input.current.summary}`,
        `NOTES SO FAR:\n${notesBlock(input.notesSoFar)}`,
        `CANDIDATES:\n${input.candidates
          .map((c, i) => `${i + 1}. ${c.title}\n   ${c.summary}`)
          .join("\n")}`,
        `Judge every candidate (exact titles as given), then decide.`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: stepDecisionSchema,
    });
    return result;
  }

  async elasticity(input: {
    seed: BurkeSeed;
    notesSoFar: BurkeNote[];
    previousStory: string | null;
  }): Promise<{ story: string; changedSubstantially: boolean; rationale: string }> {
    return this.provider.generateStructured({
      promptId: "burke-elasticity.v1",
      system: loadPrompt("burke-elasticity.v1"),
      user: [
        `SEED — ${seedLine(input.seed)}`,
        `NOTES:\n${notesBlock(input.notesSoFar, 20)}`,
        input.previousStory
          ? `PREVIOUS STORY:\n${input.previousStory}`
          : "PREVIOUS STORY: (none — this is the first checkpoint; set changedSubstantially to true)",
      ].join("\n\n"),
      schema: elasticitySchema,
    });
  }

  async recode(input: {
    seed: BurkeSeed;
    notes: BurkeNote[];
    checkpoints: Array<{ story: string }>;
  }): Promise<string> {
    const result = await this.provider.generateStructured({
      promptId: "burke-recode.v1",
      system: loadPrompt("burke-recode.v1"),
      user: [
        `SEED — ${seedLine(input.seed)}`,
        `NOTES:\n${notesBlock(input.notes, 30)}`,
        input.checkpoints.length > 0
          ? `STORY CHECKPOINTS:\n${input.checkpoints.map((c, i) => `${i + 1}. ${c.story}`).join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: recodingSchema,
    });
    return result.redescription;
  }
}
