import type { BurkeQuestion } from "@/domain/enums";
import type {
  AcceptanceGate,
  BurkeNarrative,
  BurkeNote,
  BurkeOracle,
  BurkeSeed,
  CandidateAssessment,
  CoherenceReport,
  CuriosityProgram,
  EstablishedClaim,
  MysteryState,
  NarrativeBridge,
  ReturnPath,
  StoryState,
  TheoryCheckpoint,
  TheoryVersion,
  UnresolvedQuestion,
  UnresolvedQuestionStatus,
} from "@/domain/burke/types";
import {
  assessmentsSchema,
  checkpointSchema,
  coherenceSchema,
  diagnosisSchema,
  gateSchema,
  initializationSchema,
  narrativeSchema,
  revisionSchema,
} from "@/schemas/burke";
import { loadPrompt } from "./prompt-files";
import type { LanguageModelProvider } from "./provider";

// The LLM-backed judgment faculty. Every prompt receives the STORY STATE —
// the theory, the open questions, the tension, the mystery — because the
// walker's unit of decision is an unresolved explanation, not a page.

function seedLine(seed: BurkeSeed): string {
  return `${seed.kind}: "${seed.text}"`;
}

/** Compact story-state briefing shared by every downstream prompt. */
function stateBlock(state: StoryState): string {
  const open = state.unresolvedQuestions
    .filter((q) => q.status === "open")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8)
    .map(
      (q) => `  [${q.id}] (${q.questionType}, p=${q.priority.toFixed(2)}) ${q.question}`,
    )
    .join("\n");
  const answered = state.unresolvedQuestions
    .filter((q) => q.status !== "open")
    .slice(0, 6)
    .map((q) => `  [${q.id}] ${q.status}: ${q.answerSummary ?? "—"}`)
    .join("\n");
  const claims = state.establishedClaims
    .slice(-8)
    .map((c) => `  · ${c.claim} (confidence ${c.confidence.toFixed(2)})`)
    .join("\n");

  return [
    `SEED — ${seedLine(state.seed)}`,
    `CURRENT THEORY:\n${state.currentTheory}`,
    `CURRENT TENSION:\n${state.currentTension}`,
    `MYSTERY (${state.mystery.mysteryScore.toFixed(2)} unexplained):\n${state.mystery.currentMystery}`,
    open ? `OPEN QUESTIONS:\n${open}` : "OPEN QUESTIONS: (none)",
    answered ? `SETTLED QUESTIONS:\n${answered}` : "",
    claims ? `ESTABLISHED CLAIMS:\n${claims}` : "",
    state.unexplainedRemainder.length > 0
      ? `UNEXPLAINED REMAINDER:\n${state.unexplainedRemainder.map((r) => `  · ${r}`).join("\n")}`
      : "",
    `CURIOSITY PROGRAM — concerns: ${state.curiosityProgram.mattersOfConcern.join(", ")}` +
      (state.curiosityProgram.preferredMechanisms.length > 0
        ? `\n  mechanisms: ${state.curiosityProgram.preferredMechanisms.join(", ")}`
        : "") +
      (state.curiosityProgram.avoidPatterns.length > 0
        ? `\n  AVOID: ${state.curiosityProgram.avoidPatterns.join("; ")}`
        : ""),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function notesBlock(notes: BurkeNote[], limit = 8): string {
  if (notes.length === 0) return "(no accepted nodes yet)";
  return notes
    .slice(-limit)
    .map(
      (n) =>
        `#${n.step} ${n.articleTitle} — ${n.selectedBurkeQuestion}\n` +
        `  asked: ${n.navigationQuestion}\n` +
        `  established: ${n.claimEstablishedOrChallenged}\n` +
        `  pivot: ${n.narrativePivot}\n` +
        `  relation to seed: ${n.seedRelation} / ${n.evidenceStatus}` +
        (n.bridge ? `\n  bridge: ${n.bridge.whyNext}` : ""),
    )
    .join("\n");
}

export class LlmBurkeOracle implements BurkeOracle {
  constructor(private readonly provider: LanguageModelProvider) {}

  async initialize(input: {
    seed: BurkeSeed;
    priming: string;
    historicalConsciousness: Record<string, boolean>;
    endpointStrategy: string;
    plannedLength: number;
  }): Promise<{ curiosityProgram: CuriosityProgram; state: StoryState }> {
    const enabled = Object.entries(input.historicalConsciousness)
      .filter(([, on]) => on)
      .map(([key]) => key);

    const result = await this.provider.generateStructured({
      promptId: "burke-initialize.v2",
      system: loadPrompt("burke-initialize.v2"),
      user: [
        `SEED — ${seedLine(input.seed)}`,
        `CURIOSITY PRIMING:\n${input.priming || "(none given — derive the program from the seed alone)"}`,
        `HISTORICAL-CONSCIOUSNESS LAYERS REQUESTED: ${enabled.join(", ") || "none"}`,
        `ENDPOINT STRATEGY: ${input.endpointStrategy}`,
        `PLANNED WALK LENGTH: about ${input.plannedLength} pages`,
      ].join("\n\n"),
      schema: initializationSchema,
    });

    const curiosityProgram = result.curiosityProgram as CuriosityProgram;
    const state: StoryState = {
      seed: input.seed,
      curiosityProgram,
      currentTheory: result.provisionalTheory,
      theoryVersions: [
        {
          step: 0,
          theory: result.provisionalTheory,
          changeType: "initial",
          supersedes: null,
          whatChanged: "initial provisional theory",
          whyItChanged: "constructed from the seed and curiosity priming",
          confidence: 0.3,
        },
      ],
      unresolvedQuestions: result.unresolvedQuestions as UnresolvedQuestion[],
      unexplainedRemainder: result.unexplainedRemainder,
      establishedClaims: [],
      rejectedHypotheses: [],
      currentTension: result.currentTension,
      returnPaths: [],
      mystery: result.mystery as MysteryState,
      saturation: {
        theoryChangeRate: 1,
        unresolvedQuestionReduction: 0,
        redundancyRate: 0,
        estimatedSaturation: 0,
      },
    };
    return { curiosityProgram, state };
  }

  async diagnose(input: {
    state: StoryState;
    notes: BurkeNote[];
    currentTitle: string;
  }): Promise<{
    deficiency: string;
    questionId: string | null;
    burkeQuestion: BurkeQuestion;
    navigationQuestion: string;
    searchPhrases: string[];
  }> {
    return this.provider.generateStructured({
      promptId: "burke-diagnose.v2",
      system: loadPrompt("burke-diagnose.v2"),
      user: [
        stateBlock(input.state),
        `CURRENTLY STANDING AT: ${input.currentTitle}`,
        `ACCEPTED NODES SO FAR:\n${notesBlock(input.notes)}`,
        input.state.curiosityProgram.preferredNavigationQuestions.length > 0
          ? `NAVIGATION QUESTIONS THE PROGRAM FAVORS:\n${input.state.curiosityProgram.preferredNavigationQuestions.map((q) => `  · ${q}`).join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: diagnosisSchema,
    });
  }

  async assess(input: {
    state: StoryState;
    navigationQuestion: string;
    burkeQuestion: BurkeQuestion;
    currentTitle: string;
    candidates: Array<{ title: string; summary: string }>;
  }): Promise<CandidateAssessment[]> {
    const result = await this.provider.generateStructured({
      promptId: "burke-assess.v2",
      system: loadPrompt("burke-assess.v2"),
      user: [
        stateBlock(input.state),
        `SELECTED BURKE QUESTION: ${input.burkeQuestion}`,
        `NAVIGATION QUESTION (judge candidates against THIS):\n${input.navigationQuestion}`,
        `CURRENTLY STANDING AT: ${input.currentTitle}`,
        `CANDIDATES:\n${input.candidates
          .map((c, i) => `${i + 1}. ${c.title}\n   ${c.summary}`)
          .join("\n")}`,
      ].join("\n\n"),
      schema: assessmentsSchema,
    });
    // `total` is computed by the engine, not the model.
    return result.assessments.map((a) => ({ ...a, total: 0 }));
  }

  async gate(input: {
    state: StoryState;
    navigationQuestion: string;
    previousTitle: string;
    candidate: { title: string; summary: string };
    assessment: CandidateAssessment;
    requireBridge: boolean;
  }): Promise<{ gate: AcceptanceGate; bridge: NarrativeBridge | null }> {
    const result = await this.provider.generateStructured({
      promptId: "burke-gate.v2",
      system: loadPrompt("burke-gate.v2"),
      user: [
        stateBlock(input.state),
        `NAVIGATION QUESTION:\n${input.navigationQuestion}`,
        `PREVIOUS NODE: ${input.previousTitle}`,
        `CANDIDATE: ${input.candidate.title}\n${input.candidate.summary}`,
        `PRIOR ASSESSMENT — relation: ${input.assessment.relationType}; carrier: ${input.assessment.analogyCarrier ?? "none named"}; predicted claim: ${input.assessment.predictedClaim}`,
        input.requireBridge
          ? "A BRIDGE IS REQUIRED. Return null only if no credible bridge exists — that is a rejection."
          : "A bridge is optional but write one if the transition is genuinely motivated.",
      ].join("\n\n"),
      schema: gateSchema,
    });

    const { bridge, ...gate } = result;
    return {
      gate: gate as AcceptanceGate,
      bridge: bridge
        ? {
            fromTitle: input.previousTitle,
            toTitle: input.candidate.title,
            ...bridge,
          }
        : null,
    };
  }

  async revise(input: {
    state: StoryState;
    acceptedTitle: string;
    evidence: string;
    gate: AcceptanceGate;
    step: number;
  }): Promise<{
    theoryVersion: TheoryVersion;
    note: Omit<BurkeNote, "bridge">;
    questionUpdates: Array<{
      id: string;
      status: UnresolvedQuestionStatus;
      answerSummary: string | null;
    }>;
    newQuestions: UnresolvedQuestion[];
    claims: EstablishedClaim[];
    mystery: MysteryState;
    currentTension: string;
    returnPaths: ReturnPath[];
  }> {
    const result = await this.provider.generateStructured({
      promptId: "burke-revise.v2",
      system: loadPrompt("burke-revise.v2"),
      user: [
        stateBlock(input.state),
        `ACCEPTED NODE: ${input.acceptedTitle}`,
        `EVIDENCE / CLAIM AT STAKE: ${input.evidence}`,
        `GATE FINDINGS — addresses question: ${input.gate.addressedQuestionId ?? "none"}; claim: ${input.gate.claimEstablished}; how the theory changes: ${input.gate.howTheoryChanges}; contribution: ${input.gate.contributionKind}; next question: ${input.gate.followingQuestion}`,
      ].join("\n\n"),
      schema: revisionSchema,
    });

    return {
      theoryVersion: {
        step: input.step,
        theory: result.theory,
        changeType: result.changeType,
        supersedes: result.supersedes,
        whatChanged: result.whatChanged,
        whyItChanged: result.whyItChanged,
        confidence: result.confidence,
      },
      note: {
        step: input.step,
        currentUnresolvedQuestion: "",
        selectedBurkeQuestion: "PROBLEM",
        navigationQuestion: "",
        articleTitle: input.acceptedTitle,
        theoryBefore: input.state.currentTheory,
        theoryAfter: result.theory,
        ...result.note,
      },
      questionUpdates: result.questionUpdates,
      newQuestions: result.newQuestions as UnresolvedQuestion[],
      claims: result.claims,
      mystery: result.mystery as MysteryState,
      currentTension: result.currentTension,
      returnPaths: result.returnPaths,
    };
  }

  async checkpoint(input: {
    state: StoryState;
    notes: BurkeNote[];
    previousCheckpoint: TheoryCheckpoint | null;
  }): Promise<Omit<TheoryCheckpoint, "version" | "afterAcceptedNodes">> {
    return this.provider.generateStructured({
      promptId: "burke-checkpoint.v2",
      system: loadPrompt("burke-checkpoint.v2"),
      user: [
        stateBlock(input.state),
        `THEORY AT INITIALIZATION:\n${input.state.theoryVersions[0]?.theory ?? "—"}`,
        input.previousCheckpoint
          ? `PREVIOUS CHECKPOINT (v${input.previousCheckpoint.version}, ${input.previousCheckpoint.changeClass}):\n${input.previousCheckpoint.revisedTheory}`
          : "PREVIOUS CHECKPOINT: (none — this is the first)",
        `ACCEPTED NODES:\n${notesBlock(input.notes, 15)}`,
      ].join("\n\n"),
      schema: checkpointSchema,
    });
  }

  async coherence(input: {
    state: StoryState;
    notes: BurkeNote[];
  }): Promise<Omit<CoherenceReport, "step">> {
    return this.provider.generateStructured({
      promptId: "burke-coherence.v2",
      system: loadPrompt("burke-coherence.v2"),
      user: [
        `SEED — ${seedLine(input.state.seed)}`,
        `THEORY AT INITIALIZATION:\n${input.state.theoryVersions[0]?.theory ?? "—"}`,
        `CURRENT THEORY:\n${input.state.currentTheory}`,
        `THE CHAIN:\n${notesBlock(input.notes, 20)}`,
      ].join("\n\n"),
      schema: coherenceSchema,
    });
  }

  async narrate(input: {
    state: StoryState;
    notes: BurkeNote[];
    checkpoints: TheoryCheckpoint[];
  }): Promise<BurkeNarrative> {
    const result = await this.provider.generateStructured({
      promptId: "burke-narrate.v2",
      system: loadPrompt("burke-narrate.v2"),
      user: [
        stateBlock(input.state),
        `THEORY AT INITIALIZATION:\n${input.state.theoryVersions[0]?.theory ?? "—"}`,
        `THEORY VERSIONS:\n${input.state.theoryVersions
          .map((v) => `  v${v.step} (${v.changeType}): ${v.whatChanged}`)
          .join("\n")}`,
        `CHECKPOINTS:\n${input.checkpoints
          .map((c) => `  v${c.version} (${c.changeClass}): ${c.revisedTheory}`)
          .join("\n") || "  (none)"}`,
        `THE CHAIN:\n${notesBlock(input.notes, 25)}`,
      ].join("\n\n"),
      schema: narrativeSchema,
    });
    return result as BurkeNarrative;
  }
}
