import type { NarrativeBridge } from "@/domain/explanation/types";
import type {
  AnamnesisComposition,
  AnamnesisOracle,
  AnamnesisState,
  CandidateMediationAssessment,
  Charge,
  Debt,
  DebtStatus,
  GlossVersion,
  Mediation,
  MediationGate,
  RecollectionTest,
  TerminalSentence,
} from "@/domain/anamnesis/types";
import {
  assessmentsSchema,
  compositionSchema,
  debtSelectionSchema,
  decompositionSchema,
  gateSchema,
  integrationSchema,
  recollectionSchema,
} from "@/schemas/anamnesis";
import { loadPrompt } from "./prompt-files";
import type { LanguageModelProvider } from "./provider";

// The LLM-backed judgment faculty for anamnesis. Every prompt receives the
// terminal sentence, its charges, and the live debt ledger, because the
// walker's unit of decision is an unpaid obligation of the ending.

function terminalBlock(terminal: TerminalSentence): string {
  return [
    `TERMINAL SENTENCE: "${terminal.text}"`,
    `INTENDED REGISTER: ${terminal.register}`,
    terminal.intent ? `WHAT THE AUTHOR MEANS BY IT: ${terminal.intent}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function ledgerBlock(state: AnamnesisState): string {
  const charges = state.charges
    .map(
      (c) =>
        `  [${c.id}] (${c.kind}, w=${c.weight.toFixed(2)}) "${c.fragment}" — ${c.whatItAsserts}`,
    )
    .join("\n");
  const open = state.debts
    .filter((d) => d.status === "unpaid" || d.status === "partially_paid")
    .sort((a, b) => b.priority - a.priority)
    .map(
      (d) =>
        `  [${d.id}] (${d.debtType}, p=${d.priority.toFixed(2)}, ${d.status}) ${d.statement}` +
        (d.residue ? `\n     residue: ${d.residue}` : ""),
    )
    .join("\n");
  const settled = state.debts
    .filter((d) => d.status === "paid" || d.status === "reframed")
    .map((d) => `  [${d.id}] ${d.status} by ${d.paidBy.join(", ") || "—"}`)
    .join("\n");
  const anchors = state.anchors
    .slice(-8)
    .map((a) => `  · ${a.kind}: ${a.description} (${a.sourceTitle})`)
    .join("\n");

  return [
    terminalBlock(state.terminal),
    `CURRENT GLOSS (what the sentence means so far):\n${state.currentGloss}`,
    `CHARGES:\n${charges}`,
    open ? `OUTSTANDING DEBTS:\n${open}` : "OUTSTANDING DEBTS: (none)",
    settled ? `SETTLED:\n${settled}` : "",
    anchors ? `ANCHORS THE READER NOW HAS:\n${anchors}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function mediationsBlock(mediations: Mediation[], limit = 10): string {
  if (mediations.length === 0) return "(no mediations yet)";
  return mediations
    .slice(-limit)
    .map(
      (m) =>
        `#${m.step} ${m.articleTitle} → debt ${m.debtId}\n` +
        `  supplies: ${m.whatItSupplies}\n` +
        `  pays: ${m.howItPays}\n` +
        `  anchor: ${m.anchor.description}\n` +
        `  sentence now reads: ${m.transformedUnderstanding}` +
        (m.residue ? `\n  residue: ${m.residue}` : ""),
    )
    .join("\n");
}

export class LlmAnamnesisOracle implements AnamnesisOracle {
  constructor(private readonly provider: LanguageModelProvider) {}

  async decompose(input: {
    terminal: TerminalSentence;
    audienceNote: string;
  }): Promise<{ charges: Charge[]; debts: Debt[]; initialGloss: string }> {
    const result = await this.provider.generateStructured({
      promptId: "anamnesis-decompose.v1",
      system: loadPrompt("anamnesis-decompose.v1"),
      user: [
        terminalBlock(input.terminal),
        input.audienceNote
          ? `READER TO ASSUME: ${input.audienceNote}`
          : "READER TO ASSUME: intelligent, attentive, entirely unprepared.",
      ].join("\n\n"),
      schema: decompositionSchema,
    });
    return {
      charges: result.charges as Charge[],
      debts: result.debts as Debt[],
      initialGloss: result.initialGloss,
    };
  }

  async selectDebt(input: {
    state: AnamnesisState;
    mediations: Mediation[];
    currentTitle: string;
  }): Promise<{
    debtId: string;
    reasoning: string;
    searchQuestion: string;
    searchPhrases: string[];
  }> {
    return this.provider.generateStructured({
      promptId: "anamnesis-select-debt.v1",
      system: loadPrompt("anamnesis-select-debt.v1"),
      user: [
        ledgerBlock(input.state),
        `CURRENTLY STANDING AT: ${input.currentTitle}`,
        `MEDIATIONS SO FAR:\n${mediationsBlock(input.mediations)}`,
      ].join("\n\n"),
      schema: debtSelectionSchema,
    });
  }

  async assess(input: {
    state: AnamnesisState;
    debt: Debt;
    searchQuestion: string;
    currentTitle: string;
    candidates: Array<{ title: string; summary: string }>;
  }): Promise<CandidateMediationAssessment[]> {
    const result = await this.provider.generateStructured({
      promptId: "anamnesis-assess.v1",
      system: loadPrompt("anamnesis-assess.v1"),
      user: [
        ledgerBlock(input.state),
        `DEBT BEING PAID: [${input.debt.id}] ${input.debt.statement}`,
        `ARCHIVAL QUESTION (judge candidates against THIS):\n${input.searchQuestion}`,
        `CURRENTLY STANDING AT: ${input.currentTitle}`,
        `CANDIDATES:\n${input.candidates
          .map((c, i) => `${i + 1}. ${c.title}\n   ${c.summary}`)
          .join("\n")}`,
      ].join("\n\n"),
      schema: assessmentsSchema,
    });
    // `total` is computed by the engine, not the model.
    return result.assessments.map((a) => ({
      ...a,
      total: 0,
    })) as CandidateMediationAssessment[];
  }

  async gate(input: {
    state: AnamnesisState;
    debt: Debt;
    searchQuestion: string;
    previousTitle: string;
    candidate: { title: string; summary: string };
    assessment: CandidateMediationAssessment;
    requireBridge: boolean;
  }): Promise<{ gate: MediationGate; bridge: NarrativeBridge | null }> {
    const result = await this.provider.generateStructured({
      promptId: "anamnesis-gate.v1",
      system: loadPrompt("anamnesis-gate.v1"),
      user: [
        ledgerBlock(input.state),
        `DEBT BEING PAID: [${input.debt.id}] ${input.debt.statement}`,
        `ARCHIVAL QUESTION:\n${input.searchQuestion}`,
        `PREVIOUS PAGE: ${input.previousTitle}`,
        `CANDIDATE: ${input.candidate.title}\n${input.candidate.summary}`,
        `PRIOR ASSESSMENT — expected payment: ${input.assessment.predictedPayment}; proposed anchor: ${input.assessment.proposedAnchor}; status: ${input.assessment.evidenceStatus}`,
        input.requireBridge
          ? "A BRIDGE IS REQUIRED. Returning null is a rejection."
          : "A bridge is optional but write one if the transition is genuinely motivated.",
      ].join("\n\n"),
      schema: gateSchema,
    });

    const { bridge, ...gate } = result;
    return {
      gate: gate as MediationGate,
      bridge: bridge
        ? {
            fromTitle: input.previousTitle,
            toTitle: input.candidate.title,
            ...bridge,
          }
        : null,
    };
  }

  async integrate(input: {
    state: AnamnesisState;
    debt: Debt;
    acceptedTitle: string;
    gate: MediationGate;
    step: number;
  }): Promise<{
    mediation: Omit<Mediation, "bridge" | "step" | "searchQuestion">;
    gloss: GlossVersion;
    newDebts: Debt[];
    debtStatus: DebtStatus;
  }> {
    const result = await this.provider.generateStructured({
      promptId: "anamnesis-integrate.v1",
      system: loadPrompt("anamnesis-integrate.v1"),
      user: [
        ledgerBlock(input.state),
        `DEBT: [${input.debt.id}] ${input.debt.statement}`,
        `ACCEPTED PAGE: ${input.acceptedTitle}`,
        `GATE FINDINGS — completeness: ${input.gate.paymentCompleteness}; residue: ${input.gate.residue ?? "none"}; anchor: ${input.gate.anchor?.description ?? "none"}; transformed reading: ${input.gate.transformedUnderstanding}`,
      ].join("\n\n"),
      schema: integrationSchema,
    });

    return {
      mediation: {
        articleTitle: input.acceptedTitle,
        debtId: input.debt.id,
        chargeId: input.debt.chargeId,
        whatItSupplies: result.whatItSupplies,
        howItPays: result.howItPays,
        anchor: result.anchor,
        transformedUnderstanding: result.transformedUnderstanding,
        evidenceStatus: result.evidenceStatus,
        residue: result.residue,
        confidence: result.confidence,
      },
      gloss: {
        step: input.step,
        gloss: result.gloss.gloss,
        changedBy: input.acceptedTitle,
        whatChanged: result.gloss.whatChanged,
      },
      newDebts: result.newDebts as Debt[],
      debtStatus: result.debtStatus,
    };
  }

  async recollect(input: {
    state: AnamnesisState;
    mediations: Mediation[];
  }): Promise<Omit<RecollectionTest, "afterMediations">> {
    return this.provider.generateStructured({
      promptId: "anamnesis-recollect.v1",
      system: loadPrompt("anamnesis-recollect.v1"),
      user: [
        ledgerBlock(input.state),
        `MEDIATIONS COLLECTED:\n${mediationsBlock(input.mediations, 20)}`,
      ].join("\n\n"),
      schema: recollectionSchema,
    });
  }

  async compose(input: {
    state: AnamnesisState;
    mediations: Mediation[];
    recollectionTests: RecollectionTest[];
  }): Promise<AnamnesisComposition> {
    const result = await this.provider.generateStructured({
      promptId: "anamnesis-compose.v1",
      system: loadPrompt("anamnesis-compose.v1"),
      user: [
        ledgerBlock(input.state),
        `MEDIATIONS (in discovery order — reorder for preparation):\n${mediationsBlock(input.mediations, 25)}`,
        input.recollectionTests.length > 0
          ? `LAST RE-READING:\n${input.recollectionTests[input.recollectionTests.length - 1].rereading}\nStill flat: ${input.recollectionTests[input.recollectionTests.length - 1].whatStillFallsFlat.join("; ") || "nothing noted"}`
          : "",
        `The composition MUST end with this sentence exactly, unaltered:\n"${input.state.terminal.text}"`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: compositionSchema,
    });

    // The terminal sentence is the one fixed point; never let a paraphrase
    // through, however graceful.
    return {
      ...result,
      terminalSentence: input.state.terminal.text,
    } as AnamnesisComposition;
  }
}
