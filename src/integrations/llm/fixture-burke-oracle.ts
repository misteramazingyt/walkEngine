import type {
  BurkeNote,
  BurkeOracle,
  BurkeSeed,
  CandidateJudgment,
  SalienceWeight,
  StepDecision,
} from "@/domain/burke/types";
import { BURKE_QUESTIONS, type BurkeQuestion } from "@/domain/enums";

// Deterministic Burke oracle for tests and WIKIPEDIA_MODE=fixture. Its
// judgments are honest about their nature: lexical-overlap heuristics with
// templated notes that always cite the candidate summary. It never claims
// historical insight — it exists so the ENGINE's mechanics (discard rule,
// cadence, stopping, persistence) are testable without a live model.

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

export class FixtureBurkeOracle implements BurkeOracle {
  private stepCount = 0;

  constructor(
    private readonly options: {
      /** Titles the oracle marks discarded (return potential 0). */
      discardTitles?: string[];
      /** Declare redescription achieved at this note count (0 = never). */
      redescribeAtNote?: number;
      /** Stories stop changing after this many checkpoints (saturation). */
      stabilizeAfterCheckpoint?: number;
    } = {},
  ) {}

  async prime(input: {
    seed: BurkeSeed;
    priming: string;
    motifSensitivity: string[];
  }): Promise<SalienceWeight[]> {
    const primingTerms = [...tokens(input.priming)].slice(0, 8);
    const motifTerms = input.motifSensitivity.slice(0, 6);
    const terms = [...new Set([...primingTerms, ...motifTerms])];
    const fallback = [...tokens(input.seed.text)].slice(0, 5);
    const chosen = (terms.length >= 3 ? terms : [...terms, ...fallback]).slice(0, 12);
    return chosen.map((term, i) => ({ term, weight: (i % 3) + 1 }));
  }

  async step(input: {
    seed: BurkeSeed;
    salience: SalienceWeight[];
    current: { title: string; summary: string };
    candidates: Array<{ title: string; summary: string }>;
    notesSoFar: BurkeNote[];
    preferredQuestions: BurkeQuestion[];
  }): Promise<StepDecision> {
    this.stepCount += 1;
    const salienceTokens = new Set(
      input.salience.flatMap((s) => [...tokens(s.term)]),
    );
    const discard = new Set(this.options.discardTitles ?? []);

    const judgments: CandidateJudgment[] = input.candidates.map((c) => {
      const candidateTokens = tokens(`${c.title} ${c.summary}`);
      const fit = Math.min(1, overlap(salienceTokens, candidateTokens) / 3);
      const discarded = discard.has(c.title);
      return {
        title: c.title,
        novelty: 0.5,
        historicalDepth: 0.5,
        narrativeTension: 0.4,
        conceptualFit: fit,
        explanatoryGain: fit * 0.8,
        returnPotential: discarded ? 0 : Math.max(0.4, fit),
        discarded,
        rationale: discarded
          ? "fixture: on the discard list — no route back to the seed"
          : `fixture: salience overlap ${fit.toFixed(2)}`,
      };
    });

    const eligible = judgments.filter((j) => !j.discarded);
    if (eligible.length === 0) {
      // Mirror a strict LLM: judge everything discarded and choose nothing
      // valid; the engine treats this as NO_ELIGIBLE_CANDIDATES.
      return {
        judgments,
        chosenTitle: input.candidates[0]?.title ?? "none",
        question: "PROBLEM",
        observation: "fixture: no eligible candidates",
        changedUnderstanding: "fixture: nothing to traverse",
        returnToSeed: "fixture: the seed rests",
        redescriptionAchieved: false,
      };
    }

    // Deterministic: best fit, ties by title.
    const chosen = [...eligible].sort(
      (a, b) =>
        b.conceptualFit - a.conceptualFit || a.title.localeCompare(b.title),
    )[0];
    const grammar =
      input.preferredQuestions.length > 0 ? input.preferredQuestions : BURKE_QUESTIONS;
    const question = grammar[(this.stepCount - 1) % grammar.length];
    const candidate = input.candidates.find((c) => c.title === chosen.title);
    const noteCount = input.notesSoFar.length + 1;

    return {
      judgments,
      chosenTitle: chosen.title,
      question,
      observation: `${chosen.title}: ${(candidate?.summary ?? "").slice(0, 120)}`,
      changedUnderstanding: `fixture step ${noteCount}: the seed connects to ${chosen.title.toLowerCase()}`,
      returnToSeed: `"${input.seed.text}" now touches ${chosen.title}`,
      redescriptionAchieved:
        this.options.redescribeAtNote !== undefined &&
        this.options.redescribeAtNote > 0 &&
        noteCount >= this.options.redescribeAtNote,
    };
  }

  private checkpointCount = 0;

  async elasticity(input: {
    seed: BurkeSeed;
    notesSoFar: BurkeNote[];
    previousStory: string | null;
  }): Promise<{ story: string; changedSubstantially: boolean; rationale: string }> {
    this.checkpointCount += 1;
    const stable =
      this.options.stabilizeAfterCheckpoint !== undefined &&
      this.checkpointCount > this.options.stabilizeAfterCheckpoint;
    const story = stable
      ? `Stable story of "${input.seed.text}". It has found its organizing relation. Nothing new reorganizes it.`
      : `Story v${this.checkpointCount} of "${input.seed.text}". It passes through ${input.notesSoFar.length} notes. The organizing relation is still moving.`;
    return {
      story,
      changedSubstantially: input.previousStory === null ? true : !stable,
      rationale: stable
        ? "fixture: story unchanged despite new material"
        : "fixture: organizing relation shifted",
    };
  }

  async recode(input: {
    seed: BurkeSeed;
    notes: BurkeNote[];
  }): Promise<string> {
    return `fixture recoding: "${input.seed.text}" redescribed as one episode in a structure traced through ${input.notes.length} notes (${input.notes.map((n) => n.articleTitle).join(", ")}).`;
  }
}
