import type { NarrativeBridge } from "@/domain/explanation/types";
import type {
  AnamnesisComposition,
  AnamnesisOracle,
  AnamnesisState,
  CandidateMediationAssessment,
  CandidateMediationScores,
  Charge,
  Debt,
  DebtStatus,
  GlossVersion,
  Mediation,
  MediationGate,
  RecollectionTest,
  TerminalSentence,
} from "@/domain/anamnesis/types";

// Deterministic, scriptable anamnesis oracle for tests and offline mode.
// It makes no claim to literary judgment; it exists so the ENGINE's
// mechanics — debt-before-candidates ordering, gates, residue breeding new
// debts, inhabitability stopping, verbatim terminal sentence — are testable
// without a live model.

export interface FixtureAnamnesisScript {
  /** Titles the gate always refuses. */
  rejectTitles?: string[];
  /** Titles that pay only partially, generating residue debts. */
  partialTitles?: string[];
  /** Titles with no concrete anchor. */
  anchorlessTitles?: string[];
  /** Titles judged mere restatement of the terminal sentence. */
  restatementTitles?: string[];
  /** Titles for which no bridge can be written. */
  unbridgeableTitles?: string[];
  /** Titles that pay strongly; everything else pays thinly. */
  strongTitles?: string[];
  /** Titles claiming full payment on analogy alone (engine must refuse). */
  analogyOnlyTitles?: string[];
  /** Declare the sentence inhabitable at this recollection call (1-based). */
  inhabitableAtTest?: number;
  /** Settle every outstanding debt once this many mediations are accepted. */
  settleAllAfter?: number;
}

const ZERO: CandidateMediationScores = {
  debtPaymentPotential: 0,
  concreteAnchorStrength: 0,
  historicalSpecificity: 0,
  affectiveCharge: 0,
  preparesLaterCharges: 0,
  archivalWarrant: 0,
  novelty: 0,
  registerFit: 0,
  sourceQuality: 0,
  restatesWithoutEarning: 0,
  abstractionWithoutAnchor: 0,
  redundancy: 0,
  sentimentality: 0,
  anachronism: 0,
  decorativeDetour: 0,
};

export class FixtureAnamnesisOracle implements AnamnesisOracle {
  private integrations = 0;
  private recollections = 0;

  constructor(private readonly script: FixtureAnamnesisScript = {}) {}

  async decompose(input: {
    terminal: TerminalSentence;
    audienceNote: string;
  }): Promise<{ charges: Charge[]; debts: Debt[]; initialGloss: string }> {
    const words = input.terminal.text
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .slice(0, 3);
    const charges: Charge[] = words.map((word, i) => ({
      id: `c${i + 1}`,
      kind: i === 0 ? "lexical" : i === 1 ? "claim" : "affective",
      fragment: word,
      whatItAsserts: `fixture: "${word}" carries part of the sentence`,
      weight: 0.9 - i * 0.2,
    }));
    if (charges.length === 0) {
      charges.push({
        id: "c1",
        kind: "claim",
        fragment: input.terminal.text,
        whatItAsserts: "fixture: the whole sentence",
        weight: 1,
      });
    }

    const debts: Debt[] = charges.flatMap((charge, i) => [
      {
        id: `d${i + 1}`,
        chargeId: charge.id,
        statement: `fixture: the reader must already know what "${charge.fragment}" meant historically`,
        debtType: "unfamiliar_term" as const,
        priority: 0.9 - i * 0.15,
        status: "unpaid" as const,
        paidBy: [],
        residue: null,
      },
    ]);
    // Guarantee the schema's three-debt minimum shape in tests.
    while (debts.length < 3) {
      const n = debts.length + 1;
      debts.push({
        id: `d${n}`,
        chargeId: charges[0].id,
        statement: `fixture debt ${n}: the reader must feel why this matters`,
        debtType: "unfelt_stakes",
        priority: 0.5,
        status: "unpaid",
        paidBy: [],
        residue: null,
      });
    }

    return {
      charges,
      debts,
      initialGloss: `fixture gloss 0: "${input.terminal.text}" currently reads as bare assertion`,
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
    const open = input.state.debts
      .filter((d) => d.status === "unpaid" || d.status === "partially_paid")
      .sort((a, b) => b.priority - a.priority);
    const target = open[0];
    return {
      debtId: target?.id ?? "d1",
      reasoning: `fixture: ${target?.statement ?? "nothing outstanding"}`,
      searchQuestion: `fixture question: where does "${target?.statement ?? "the debt"}" become concrete?`,
      searchPhrases: ["institution", "practice"],
    };
  }

  async assess(input: {
    state: AnamnesisState;
    debt: Debt;
    searchQuestion: string;
    currentTitle: string;
    candidates: Array<{ title: string; summary: string }>;
  }): Promise<CandidateMediationAssessment[]> {
    const strong = new Set(this.script.strongTitles ?? []);
    const analogyOnly = new Set(this.script.analogyOnlyTitles ?? []);
    const restating = new Set(this.script.restatementTitles ?? []);

    return input.candidates.map((c) => {
      const isStrong = strong.size === 0 ? true : strong.has(c.title);
      const scores: CandidateMediationScores = {
        ...ZERO,
        debtPaymentPotential: isStrong ? 0.9 : 0.15,
        concreteAnchorStrength: isStrong ? 0.8 : 0.2,
        historicalSpecificity: isStrong ? 0.75 : 0.2,
        affectiveCharge: 0.5,
        preparesLaterCharges: isStrong ? 0.6 : 0.2,
        archivalWarrant: 0.6,
        novelty: 0.5,
        registerFit: 0.5,
        sourceQuality: 0.6,
        restatesWithoutEarning: restating.has(c.title) ? 0.9 : isStrong ? 0.1 : 0.6,
        abstractionWithoutAnchor: isStrong ? 0.1 : 0.6,
        redundancy: 0.1,
        sentimentality: 0.1,
        anachronism: 0.1,
        decorativeDetour: isStrong ? 0.1 : 0.5,
      };
      return {
        title: c.title,
        scores,
        total: 0,
        evidenceStatus: analogyOnly.has(c.title)
          ? ("structural analogy" as const)
          : ("historical precondition" as const),
        predictedPayment: `fixture: ${c.title} would settle ${input.debt.id}`,
        proposedAnchor: `fixture anchor from ${c.title}`,
        rationale: isStrong
          ? "fixture: pays the selected debt directly"
          : "fixture: touches the vocabulary, settles nothing",
      };
    });
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
    const title = input.candidate.title;
    const rejected = (this.script.rejectTitles ?? []).includes(title);
    const weak = input.assessment.scores.debtPaymentPotential < 0.5;
    const restates = (this.script.restatementTitles ?? []).includes(title);
    const anchorless = (this.script.anchorlessTitles ?? []).includes(title);
    const partial = (this.script.partialTitles ?? []).includes(title);
    const analogyOnly = (this.script.analogyOnlyTitles ?? []).includes(title);
    const unbridgeable = (this.script.unbridgeableTitles ?? []).includes(title);

    if (rejected || weak) {
      return {
        gate: {
          debtId: input.debt.id,
          paysDebt: false,
          paymentCompleteness: "none",
          residue: null,
          suppliesConcreteAnchor: false,
          anchor: null,
          earnsRatherThanRestates: false,
          transformedUnderstanding: "fixture: unchanged",
          evidenceStatus: "shared condition",
          verdict: "reject",
          rejectionReason: rejected
            ? "fixture: on the reject list"
            : "fixture: shares vocabulary, settles nothing",
        },
        bridge: null,
      };
    }

    return {
      gate: {
        debtId: input.debt.id,
        paysDebt: true,
        paymentCompleteness: partial ? "partial" : "full",
        residue: partial
          ? `fixture residue: ${title} leaves the mechanism unexplained`
          : null,
        suppliesConcreteAnchor: !anchorless,
        anchor: anchorless
          ? null
          : {
              description: `fixture anchor: a scene drawn from ${title}`,
              kind: "scene",
              sourceTitle: title,
            },
        earnsRatherThanRestates: !restates,
        transformedUnderstanding: `fixture: the sentence now rests on ${title}`,
        evidenceStatus: analogyOnly
          ? "structural analogy"
          : "historical precondition",
        verdict: "accept",
        rejectionReason: null,
      },
      bridge: unbridgeable
        ? null
        : {
            fromTitle: input.previousTitle,
            toTitle: title,
            unresolvedByPrevious: `fixture: ${input.previousTitle} left the debt open`,
            whyNext: `fixture: ${title} is where it becomes concrete`,
            standsAlone: true,
          },
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
    this.integrations += 1;
    const n = this.integrations;
    const partial = input.gate.paymentCompleteness === "partial";
    const settleAll =
      this.script.settleAllAfter !== undefined &&
      n >= this.script.settleAllAfter;

    return {
      mediation: {
        articleTitle: input.acceptedTitle,
        debtId: input.debt.id,
        chargeId: input.debt.chargeId,
        whatItSupplies: `fixture: ${input.acceptedTitle} supplies material for ${input.debt.id}`,
        howItPays: `fixture payment ${n}`,
        anchor: input.gate.anchor ?? {
          description: `fixture anchor ${n}`,
          kind: "object",
          sourceTitle: input.acceptedTitle,
        },
        transformedUnderstanding: `fixture: after ${input.acceptedTitle} the sentence reads less as assertion`,
        evidenceStatus: input.gate.evidenceStatus,
        residue: input.gate.residue,
        confidence: 0.6,
      },
      gloss: {
        step: input.step,
        gloss: `fixture gloss ${n}: the sentence now rests on ${input.acceptedTitle}`,
        changedBy: input.acceptedTitle,
        whatChanged: `fixture: ${input.debt.id} ${partial ? "partly " : ""}settled`,
      },
      // A partial payment breeds the debt its residue names.
      newDebts: partial
        ? [
            {
              id: `d-residue-${n}`,
              chargeId: input.debt.chargeId,
              statement: `fixture residual debt from ${input.acceptedTitle}`,
              debtType: "assumed_mechanism",
              priority: 0.55,
              status: "unpaid",
              paidBy: [],
              residue: null,
            },
          ]
        : [],
      debtStatus: settleAll ? "paid" : partial ? "partially_paid" : "paid",
    };
  }

  async recollect(input: {
    state: AnamnesisState;
    mediations: Mediation[];
  }): Promise<Omit<RecollectionTest, "afterMediations">> {
    this.recollections += 1;
    const inhabitable =
      this.script.inhabitableAtTest !== undefined &&
      this.recollections >= this.script.inhabitableAtTest;
    return {
      rereading: `fixture re-reading ${this.recollections} of "${input.state.terminal.text}"`,
      whatNowLands: input.mediations.map((m) => m.articleTitle),
      whatStillFallsFlat: inhabitable
        ? []
        : ["fixture: the stakes remain unfelt"],
      inhabitabilityScore: inhabitable ? 0.85 : 0.4,
      inhabitable,
    };
  }

  async compose(input: {
    state: AnamnesisState;
    mediations: Mediation[];
    recollectionTests: RecollectionTest[];
  }): Promise<AnamnesisComposition> {
    return {
      opening: `fixture opening: an ordinary scene drawn from ${input.state.anchors[0]?.sourceTitle ?? "the archive"}`,
      movements: input.mediations.map((m) => ({
        title: m.articleTitle,
        preparesWhat: `fixture: prepares ${m.debtId}`,
        prose: `fixture movement on ${m.articleTitle}: ${m.whatItSupplies}`,
      })),
      orderingRationale:
        "fixture: composition follows discovery order; no reordering required",
      approach: "fixture approach paragraph gathering the anchors",
      terminalSentence: input.state.terminal.text,
      whatRemainsUnearned:
        input.recollectionTests[input.recollectionTests.length - 1]
          ?.whatStillFallsFlat.join("; ") || "fixture: nothing noted",
      ledger: input.mediations.map((m) => ({
        claim: m.howItPays,
        status: m.evidenceStatus,
      })),
    };
  }
}
