import type { BurkeQuestion } from "@/domain/enums";
import type {
  AcceptanceGate,
  BurkeNarrative,
  BurkeNote,
  BurkeOracle,
  BurkeSeed,
  CandidateAssessment,
  CandidateScores,
  CoherenceReport,
  CuriosityProgram,
  EstablishedClaim,
  MysteryState,
  NarrativeBridge,
  ReturnPath,
  StoryState,
  TheoryChangeClass,
  TheoryCheckpoint,
  TheoryVersion,
  UnresolvedQuestion,
  UnresolvedQuestionStatus,
} from "@/domain/burke/types";

// Deterministic, scriptable Burke oracle for tests and offline mode. It
// makes no claim to historical insight; it exists so the ENGINE's mechanics
// — question-first control flow, gates, bridges, backtracking, saturation,
// stop conditions — are testable without a live model.

export interface FixtureOracleScript {
  /** Titles the gate always refuses. */
  rejectTitles?: string[];
  /** Titles for which no bridge can be written (forces rejection). */
  unbridgeableTitles?: string[];
  /** Titles treated as high-gain; everything else scores low. */
  strongTitles?: string[];
  /** Titles scored as sensational detours. */
  sensationalTitles?: string[];
  /** Titles assessed as bare analogies with no carrier. */
  analogyOnlyTitles?: string[];
  /** Checkpoint change classes, consumed in order. */
  changeClasses?: TheoryChangeClass[];
  /** Coherence scores, consumed in order. */
  coherenceScores?: number[];
  /** Report a sensational hijack at these coherence call indexes (1-based). */
  hijackAtCoherenceCall?: number[];
  /** Mark every open question answered once this many nodes are accepted. */
  resolveQuestionsAfter?: number;
  /** Emit a strong return path + improved recoding at this node count. */
  recodeAtNode?: number;
  /** Theory change types, consumed in order (default: meaningful). */
  changeTypes?: TheoryVersion["changeType"][];
}

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

const ZERO_SCORES: CandidateScores = {
  questionAnsweringPotential: 0,
  theoryRevisionPotential: 0,
  historicalDependencyStrength: 0,
  narrativeTensionGain: 0,
  causalOrInstitutionalSpecificity: 0,
  novelty: 0,
  returnPotential: 0,
  curiosityProgramFit: 0,
  sourceQuality: 0,
  lexicalSimilarityWithoutExplanatoryGain: 0,
  analogyOnlyPenalty: 0,
  redundancy: 0,
  genericAbstractionPenalty: 0,
  sensationalDetourPenalty: 0,
  seedForcingPenalty: 0,
};

export class FixtureBurkeOracle implements BurkeOracle {
  private diagnoseCalls = 0;
  private checkpointCalls = 0;
  private coherenceCalls = 0;
  private reviseCalls = 0;

  constructor(private readonly script: FixtureOracleScript = {}) {}

  async initialize(input: {
    seed: BurkeSeed;
    priming: string;
    historicalConsciousness: Record<string, boolean>;
    endpointStrategy: string;
    plannedLength: number;
  }): Promise<{ curiosityProgram: CuriosityProgram; state: StoryState }> {
    const concerns = [...tokens(input.priming)].slice(0, 8);
    const curiosityProgram: CuriosityProgram = {
      seedAssumption: `fixture: "${input.seed.text}" works through publicly maintained expectations`,
      mattersOfConcern: concerns.length > 0 ? concerns : ["fixture concern"],
      preferredMechanisms: ["public naming", "role assignment"],
      preferredHistoricalRelations: ["precondition", "institutional inheritance"],
      desiredTensions: ["play versus discipline"],
      suspectedGenealogies: [],
      comparisonDimensions: [],
      avoidPatterns: ["generic collective-action analogies"],
      sourceDomainPreferences: [],
      temporalPreferences: [],
      geographicPreferences: [],
      narrativeVoice: "fixture",
      riskTolerance: 0.5,
      analogyTolerance: 0.2,
      causalityThreshold: 0.5,
      surpriseWeight: 0.4,
      historicalDepthWeight: 0.7,
      preferredNavigationQuestions: [],
    };

    const questionTypes: BurkeQuestion[] = [
      "PRECONDITION",
      "PROBLEM",
      "SELECTION",
      "TRANSFORMATION",
    ];
    const unresolvedQuestions: UnresolvedQuestion[] = questionTypes.map(
      (questionType, i) => ({
        id: `q${i + 1}`,
        question: `fixture question ${i + 1} about ${input.seed.text}`,
        questionType,
        priority: 0.9 - i * 0.1,
        originStep: 0,
        status: "open" as const,
        answerSummary: null,
      }),
    );

    return {
      curiosityProgram,
      state: {
        seed: input.seed,
        curiosityProgram,
        currentTheory: `fixture provisional theory of "${input.seed.text}"`,
        theoryVersions: [
          {
            step: 0,
            theory: `fixture provisional theory of "${input.seed.text}"`,
            changeType: "initial",
            supersedes: null,
            whatChanged: "initial provisional theory",
            whyItChanged: "constructed from seed and priming",
            confidence: 0.3,
          },
        ],
        unresolvedQuestions,
        unexplainedRemainder: ["fixture: the mechanism is unspecified"],
        establishedClaims: [],
        rejectedHypotheses: [],
        currentTension: "fixture tension: two accounts of the seed conflict",
        returnPaths: [],
        mystery: {
          originalMystery: `why "${input.seed.text}"?`,
          currentMystery: `why "${input.seed.text}"?`,
          mysteryScore: 0.9,
          productiveComplications: [],
          resolvedComponents: [],
        },
        saturation: {
          theoryChangeRate: 1,
          unresolvedQuestionReduction: 0,
          redundancyRate: 0,
          estimatedSaturation: 0,
        },
      },
    };
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
    this.diagnoseCalls += 1;
    const open = input.state.unresolvedQuestions
      .filter((q) => q.status === "open")
      .sort((a, b) => b.priority - a.priority);
    const target = open[0];
    return {
      deficiency: target
        ? `fixture deficiency: ${target.question}`
        : "fixture deficiency: nothing open remains",
      questionId: target?.id ?? null,
      burkeQuestion: target?.questionType ?? "RECODING",
      navigationQuestion: `fixture navigation question ${this.diagnoseCalls}: what explains ${target?.question ?? "the remainder"}?`,
      searchPhrases: [
        input.state.curiosityProgram.mattersOfConcern[0] ?? "history",
        "institution",
      ],
    };
  }

  async assess(input: {
    state: StoryState;
    navigationQuestion: string;
    burkeQuestion: BurkeQuestion;
    currentTitle: string;
    candidates: Array<{ title: string; summary: string }>;
  }): Promise<CandidateAssessment[]> {
    const strong = new Set(this.script.strongTitles ?? []);
    const sensational = new Set(this.script.sensationalTitles ?? []);
    const analogyOnly = new Set(this.script.analogyOnlyTitles ?? []);
    const concernTokens = new Set(
      input.state.curiosityProgram.mattersOfConcern.flatMap((c) => [
        ...tokens(c),
      ]),
    );

    return input.candidates.map((c) => {
      const fit = Math.min(
        1,
        overlap(concernTokens, tokens(`${c.title} ${c.summary}`)) / 3,
      );
      // Default: candidates carry explanatory gain, so engine mechanics are
      // exercised. Tests that need refusals name their strong titles and
      // everything else is judged resemblance-only.
      const isStrong = strong.size === 0 ? true : strong.has(c.title);
      const isSensational = sensational.has(c.title);
      const isAnalogyOnly = analogyOnly.has(c.title);

      const scores: CandidateScores = {
        ...ZERO_SCORES,
        questionAnsweringPotential: isStrong ? 0.9 : 0.15,
        theoryRevisionPotential: isStrong ? 0.8 : 0.1,
        historicalDependencyStrength: isStrong ? 0.75 : 0.1,
        narrativeTensionGain: isStrong ? 0.6 : 0.2,
        causalOrInstitutionalSpecificity: isStrong ? 0.7 : 0.2,
        novelty: 0.5,
        returnPotential: isStrong ? 0.7 : 0.3,
        curiosityProgramFit: fit,
        sourceQuality: 0.6,
        lexicalSimilarityWithoutExplanatoryGain: isStrong ? 0.1 : 0.7,
        analogyOnlyPenalty: isAnalogyOnly ? 0.9 : 0.1,
        redundancy: 0.1,
        genericAbstractionPenalty: isStrong ? 0.1 : 0.5,
        sensationalDetourPenalty: isSensational ? 0.95 : 0,
        seedForcingPenalty: isStrong ? 0.1 : 0.6,
      };

      return {
        title: c.title,
        scores,
        total: 0,
        relationType: isAnalogyOnly
          ? ("structural analogy" as const)
          : ("historical precondition" as const),
        analogyCarrier: isAnalogyOnly ? null : null,
        predictedClaim: `fixture: ${c.title} may establish a precondition`,
        predictedTheoryRevision: isStrong
          ? `fixture: would specify the mechanism via ${c.title}`
          : "fixture: would add detail only",
        rationale: isStrong
          ? "fixture: answers the navigation question directly"
          : "fixture: resemblance without explanatory gain",
      };
    });
  }

  async gate(input: {
    state: StoryState;
    navigationQuestion: string;
    previousTitle: string;
    candidate: { title: string; summary: string };
    assessment: CandidateAssessment;
    requireBridge: boolean;
  }): Promise<{ gate: AcceptanceGate; bridge: NarrativeBridge | null }> {
    const rejected = (this.script.rejectTitles ?? []).includes(
      input.candidate.title,
    );
    const unbridgeable = (this.script.unbridgeableTitles ?? []).includes(
      input.candidate.title,
    );
    const weak = input.assessment.scores.questionAnsweringPotential < 0.5;
    const open = input.state.unresolvedQuestions.find((q) => q.status === "open");

    if (rejected || weak) {
      return {
        gate: {
          addressedQuestionId: null,
          claimEstablished: "fixture: none",
          howTheoryChanges: "fixture: it would not",
          contributionKind: "none",
          strongerThanResemblance: false,
          followingQuestion: "fixture: none",
          answersHighPriorityQuestion: false,
          invalidatesPartOfTheory: false,
          revealsDeeperPrecondition: false,
          introducesConsequentialAlternative: false,
          createsStrongerNarrativePivot: false,
          enablesImprovedRecoding: false,
          verdict: "reject",
          rejectionReason: rejected
            ? "fixture: on the reject list"
            : "fixture: resemblance only, no explanatory gain",
        },
        bridge: null,
      };
    }

    const nodeCount = this.reviseCalls + 1;
    const recodes =
      this.script.recodeAtNode !== undefined &&
      nodeCount >= this.script.recodeAtNode;

    return {
      gate: {
        addressedQuestionId: open?.id ?? null,
        claimEstablished: `fixture: ${input.candidate.title} establishes a precondition`,
        howTheoryChanges: "fixture: specifies the mechanism",
        contributionKind: "dependency",
        strongerThanResemblance: true,
        followingQuestion: `fixture: what did ${input.candidate.title} leave unexplained?`,
        answersHighPriorityQuestion: true,
        invalidatesPartOfTheory: false,
        revealsDeeperPrecondition: true,
        introducesConsequentialAlternative: false,
        createsStrongerNarrativePivot: false,
        enablesImprovedRecoding: recodes,
        verdict: "accept",
        rejectionReason: null,
      },
      bridge: unbridgeable
        ? null
        : {
            fromTitle: input.previousTitle,
            toTitle: input.candidate.title,
            unexplainedByPrevious: `fixture: ${input.previousTitle} did not explain the mechanism`,
            whyNext: `fixture: ${input.candidate.title} names the institution that did`,
            standsWithoutSeed: true,
          },
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
    this.reviseCalls += 1;
    const n = this.reviseCalls;
    const changeType =
      this.script.changeTypes?.[n - 1] ??
      ((n % 2 === 0 ? "corrective" : "substitutive") as TheoryVersion["changeType"]);

    const resolveAll =
      this.script.resolveQuestionsAfter !== undefined &&
      n >= this.script.resolveQuestionsAfter;
    const questionUpdates = resolveAll
      ? input.state.unresolvedQuestions
          .filter((q) => q.status === "open")
          .map((q) => ({
            id: q.id,
            status: "answered" as const,
            answerSummary: `fixture: settled at step ${input.step}`,
          }))
      : input.gate.addressedQuestionId
        ? [
            {
              id: input.gate.addressedQuestionId,
              status: "answered" as const,
              answerSummary: `fixture: answered by ${input.acceptedTitle}`,
            },
          ]
        : [];

    const recodes =
      this.script.recodeAtNode !== undefined && n >= this.script.recodeAtNode;

    return {
      theoryVersion: {
        step: input.step,
        theory: `fixture theory v${n}: before, the account rested on ${input.state.currentTheory.slice(0, 40)}…; now ${input.acceptedTitle} requires a mechanism instead`,
        changeType,
        supersedes: input.state.currentTheory,
        whatChanged: `fixture: the mechanism moved to ${input.acceptedTitle}`,
        whyItChanged: "fixture: the prior account could not explain the case",
        confidence: 0.5,
      },
      note: {
        step: input.step,
        currentUnresolvedQuestion: "",
        selectedBurkeQuestion: "PRECONDITION",
        navigationQuestion: "",
        articleTitle: input.acceptedTitle,
        whyChosen: `fixture: ${input.acceptedTitle} answers the navigation question`,
        relevantEvidence: input.evidence,
        claimEstablishedOrChallenged: input.gate.claimEstablished,
        theoryBefore: input.state.currentTheory,
        theoryAfter: "",
        narrativePivot: `fixture pivot ${n}`,
        newUnresolvedQuestion: input.gate.followingQuestion,
        seedRelation: n <= 2 ? "deferred" : "direct",
        evidenceStatus: "historical precondition",
        analogyCarrier: null,
        confidence: 0.5,
      },
      questionUpdates,
      newQuestions: resolveAll
        ? []
        : [
            {
              id: `q-gen-${n}`,
              question: input.gate.followingQuestion,
              questionType: "PROBLEM",
              priority: 0.5,
              originStep: input.step,
              status: "open",
              answerSummary: null,
            },
          ],
      claims: [
        {
          claim: input.gate.claimEstablished,
          supportNodeTitles: [input.acceptedTitle],
          confidence: 0.5,
        },
      ],
      mystery: {
        ...input.state.mystery,
        currentMystery: `fixture mystery after ${n}: a deeper problem appeared`,
        mysteryScore: Math.max(0.2, 0.9 - n * 0.1),
        productiveComplications: [
          ...input.state.mystery.productiveComplications,
          `fixture complication ${n}`,
        ],
      },
      currentTension: `fixture tension ${n}`,
      returnPaths: recodes
        ? [
            {
              nodeTitle: input.acceptedTitle,
              possibleRecode: "fixture: the seed can now be redescribed",
              strength: 0.9,
            },
          ]
        : [],
    };
  }

  async checkpoint(input: {
    state: StoryState;
    notes: BurkeNote[];
    previousCheckpoint: TheoryCheckpoint | null;
  }): Promise<Omit<TheoryCheckpoint, "version" | "afterAcceptedNodes">> {
    this.checkpointCalls += 1;
    const changeClass: TheoryChangeClass =
      this.script.changeClasses?.[this.checkpointCalls - 1] ??
      "meaningful refinement";
    return {
      previousTheory: input.previousCheckpoint?.revisedTheory ?? "",
      revisedTheory: input.state.currentTheory,
      decisiveDiscoveries: input.notes.slice(-2).map((n) => n.articleTitle),
      whatRemainsUnexplained: input.state.mystery.currentMystery,
      strongestTension: input.state.currentTension,
      nextBestQuestion: "fixture: what selected this form over its rivals?",
      changeClass,
    };
  }

  async coherence(input: {
    state: StoryState;
    notes: BurkeNote[];
  }): Promise<Omit<CoherenceReport, "step">> {
    this.coherenceCalls += 1;
    const score =
      this.script.coherenceScores?.[this.coherenceCalls - 1] ?? 0.8;
    const hijack = (this.script.hijackAtCoherenceCall ?? []).includes(
      this.coherenceCalls,
    );
    return {
      transitionsExplainableWithoutSeed: score >= 0.5,
      eachNodeArisesFromPriorDeficiency: score >= 0.5,
      accumulatingMechanismsNotExamples: score >= 0.5,
      governingQuestionChangedIntelligibly: true,
      removableNodes: [],
      duplicateFunctionNodes: [],
      sensationalHijack: hijack,
      movesBackwardThenForward: true,
      theoryDiffersFromInitial:
        input.state.currentTheory !== input.state.theoryVersions[0]?.theory,
      score,
      diagnosis: hijack
        ? "fixture: a sensational page hijacked the thread"
        : `fixture coherence ${score}`,
    };
  }

  async narrate(input: {
    state: StoryState;
    notes: BurkeNote[];
    checkpoints: TheoryCheckpoint[];
  }): Promise<BurkeNarrative> {
    return {
      hook: `fixture hook about "${input.state.seed.text}"`,
      initialApparentAnswer: input.state.theoryVersions[0]?.theory ?? "",
      firstContradiction: "fixture: the first account could not explain itself",
      pivots: input.notes.map((n) => ({
        title: n.articleTitle,
        motivation: n.bridge?.whyNext ?? n.whyChosen,
        development: n.claimEstablishedOrChallenged,
      })),
      reversals: input.checkpoints
        .filter((c) => c.changeClass === "major reframing" || c.changeClass === "reversal")
        .map((c) => c.revisedTheory),
      returnToSeed: `fixture: "${input.state.seed.text}" redescribed`,
      remainingUncertainty: input.state.mystery.currentMystery,
      evidenceLedger: input.state.establishedClaims.map((c) => ({
        claim: c.claim,
        status: "historical precondition" as const,
      })),
    };
  }
}
