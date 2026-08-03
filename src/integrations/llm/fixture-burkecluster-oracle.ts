import type { ClusterPacket } from "@/domain/graph/packet";
import type {
  AcceptedSubjectCluster,
  AttentionProgram,
  BurkeClusterNarrative,
  BurkeClusterOracle,
  BurkeClusterState,
  CandidateClusterScores,
  DeficiencyScores,
  ExplanatoryDeficiency,
  IncipitSubjectum,
  InterpretedCluster,
  PageReference,
  Subject,
  SubjectNarrationModel,
  SubjectScores,
  SubjectTransition,
  WrapAround,
} from "@/domain/burkecluster/types";

// Deterministic, scriptable BurkeCluster oracle for tests and offline mode.
// It exists so the ENGINE's mechanics — deficiency-before-sampling, pivot
// validation, latency requirements, reverse presentation order, budgets —
// are testable without a live model. It claims no historical judgment.

export interface FixtureClusterScript {
  /** Cluster ids whose subject interpretation is refused. */
  rejectClusterIds?: string[];
  /** Subject labels for which no latency can be stated (pivot must fail). */
  unlatentSubjects?: string[];
  /** Subjects whose incipit cites a predicate that does not exist. */
  fabricatedPredicateSubjects?: string[];
  /** Subjects whose pivot rests on weak evidence with low confidence. */
  weakEvidenceSubjects?: string[];
  /** Subjects offered with no audience anchor. */
  anchorlessSubjects?: string[];
  /** Cluster ids scored as bearing the deficiency; others score low. */
  bearingClusterIds?: string[];
  /** Stop producing deficiencies after this many narrations. */
  exhaustDeficienciesAfter?: number;
}

const ZERO_CLUSTER: CandidateClusterScores = {
  deficiencyFit: 0,
  subjectEmergencePotential: 0,
  clusterStability: 0,
  complementarity: 0,
  historicalSpecificity: 0,
  immanentTransitionStrength: 0,
  narrativePivotPotential: 0,
  personalizedRelevance: 0,
  audienceIntelligibility: 0,
  concreteAnchorStrength: 0,
  attentionProgramFit: 0,
  surprise: 0,
  endpointReturnPotential: 0,
  genericAbstraction: 0,
  weakDeficiencyRelation: 0,
  semanticRedundancy: 0,
  forcedHistoricalRelation: 0,
  listPageArtifact: 0,
  sensationalDetour: 0,
  excessiveObscurity: 0,
};

const ZERO_SUBJECT: SubjectScores = {
  deficiencyResolution: 0,
  clusterRepresentativeness: 0,
  predicateInstantiation: 0,
  narrativeSubjecthood: 0,
  historicalSpecificity: 0,
  immanentPivotStrength: 0,
  bridgeCapacity: 0,
  audienceIntelligibility: 0,
  archivalSupport: 0,
  concreteScenePotential: 0,
  attentionProgramFit: 0,
  genericAbstraction: 0,
  merelyAssociativeRelation: 0,
  forcedCausality: 0,
  clusterMisrepresentation: 0,
  excessiveObscurity: 0,
};

export class FixtureBurkeClusterOracle implements BurkeClusterOracle {
  private narrations = 0;
  private subjects = 0;

  constructor(private readonly script: FixtureClusterScript = {}) {}

  async resolveSeed(input: {
    rawSeed: string;
    attentionText: string;
    candidates: Array<{ title: string; summary: string }>;
  }): Promise<{
    seedPages: PageReference[];
    attention: AttentionProgram;
    seedSubject: Subject;
  }> {
    const chosen = input.candidates.slice(0, 3);
    const terms = input.attentionText
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 4)
      .slice(0, 6);
    return {
      seedPages: chosen.map((c, i) => ({
        title: c.title,
        url: `https://fixture.local/wiki/${encodeURIComponent(c.title)}`,
        reason: `fixture: candidate ${i + 1} for the seed region`,
        score: 0.9 - i * 0.1,
      })),
      attention: {
        rawText: input.attentionText,
        salienceTerms: (terms.length >= 3 ? terms : ["fixture", "archive", "practice"]).map(
          (term, i) => ({ term, weight: (i % 3) + 1 }),
        ),
        preferredHistoricalRelations: ["PRECONDITION", "TRANSFORMATION"],
        preferredSubjectTypes: ["practice", "institution"],
        desiredTensions: ["fixture tension"],
        avoidPatterns: ["fixture: generic collective-action analogies"],
        audienceProfile: {
          targetAgeMin: 10,
          targetAgeMax: 16,
          requireConcreteAnchor: true,
          maxAbstractClustersInSequence: 1,
        },
      },
      seedSubject: {
        id: "subject-seed",
        label: `fixture seed subject: ${input.rawSeed.slice(0, 40)}`,
        type: "practice",
        centralPageTitle: chosen[0]?.title ?? null,
        synthesized: false,
        constitutivePages: chosen.map((c) => c.title),
        peripheralPages: [],
        audienceAnchor: "fixture: an ordinary scene",
      },
    };
  }

  async narrate(input: {
    subject: Subject;
    packet: ClusterPacket | null;
    passages: Array<{ title: string; summary: string }>;
    attention: AttentionProgram;
    seedLabel: string;
  }): Promise<SubjectNarrationModel> {
    this.narrations += 1;
    const n = this.narrations;
    const exhausted =
      this.script.exhaustDeficienciesAfter !== undefined &&
      n > this.script.exhaustDeficienciesAfter;

    const predicates = [1, 2, 3].map((i) => ({
      id: `p${n}-${i}`,
      text: `fixture predicate ${i} of ${input.subject.label}`,
      predicateType:
        (["precondition", "transformation", "institutional_function"] as const)[i - 1],
      // The last predicate is illustrative, so a test can drive the
      // engine's refusal to chase an account's scenery.
      role: i === 2 ? ("illustrative" as const) : ("constitutive" as const),
      supportPages: input.subject.constitutivePages.slice(0, 2),
      supportStrength: 0.6,
      explanatoryCompleteness: 0.4,
      importanceToSubject: 0.9 - i * 0.1,
      nextSubjectPotential: 0.7,
    }));

    const deficiencies: ExplanatoryDeficiency[] = exhausted
      ? []
      : predicates.slice(0, 3).map((p, i) => ({
          id: `d${n}-${i + 1}`,
          subjectId: input.subject.id,
          predicateId: p.id,
          deficiencyStatement: `fixture: ${input.subject.label} helps explain ${p.text}, but does not explain how it became possible`,
          deficiencyType: "mechanism_unexplained" as const,
          whyItMatters: "fixture: the account stays superficial without it",
          impliedSearchDomain: ["institution", "practice"],
          impliedSubjectTypes: ["institution" as const],
          narrativePressure: 0.8 - i * 0.1,
          historicalDepthPotential: 0.7,
          audiencePotential: 0.6,
          status: "open" as const,
        }));

    return {
      subjectId: input.subject.id,
      subjectLabel: input.subject.label,
      subjectType: input.subject.type,
      narrativeClaim: `fixture claim about ${input.subject.label}`,
      account: `fixture account ${n} of ${input.subject.label}. It did something, answered a problem, and left a mechanism unexplained.`,
      predicates,
      deficiencies,
      strongestDeficiencyId: deficiencies[0]?.id ?? null,
      provisionalClosingSentence: `fixture closing ${n}`,
    };
  }

  async selectDeficiency(input: {
    narration: SubjectNarrationModel;
    attention: AttentionProgram;
    seedLabel: string;
    alreadyDiscovered: string[];
  }): Promise<{
    deficiencyId: string;
    scores: DeficiencyScores;
    reasoning: string;
    searchTerms: string[];
  }> {
    const target = input.narration.deficiencies[0];
    return {
      deficiencyId: target?.id ?? "none",
      scores: {
        importanceToCurrentSubject: 0.9,
        narrativePressure: 0.8,
        historicalDepthPotential: 0.7,
        capacityToGenerateConcreteSubject: 0.7,
        relationToSeed: 0.6,
        attentionProgramFit: 0.6,
        audiencePotential: 0.6,
        surprisePotential: 0.5,
        genericness: 0.1,
        redundancy: 0.1,
        excessiveAbstraction: 0.1,
        weakArchivalSearchability: 0.1,
      },
      reasoning: "fixture: the most pressing gap",
      searchTerms: ["institution", "practice"],
    };
  }

  async interpretClusters(input: {
    packets: ClusterPacket[];
    deficiency: ExplanatoryDeficiency;
    currentSubject: Subject;
    narration: SubjectNarrationModel;
    attention: AttentionProgram;
    alreadyDiscovered: string[];
  }): Promise<InterpretedCluster[]> {
    const rejected = new Set(this.script.rejectClusterIds ?? []);
    const bearing = new Set(this.script.bearingClusterIds ?? []);
    const anchorless = new Set(this.script.anchorlessSubjects ?? []);

    return input.packets.map((packet, index) => {
      if (rejected.has(packet.clusterId)) {
        return {
          clusterId: packet.clusterId,
          subject: null,
          scores: { ...ZERO_CLUSTER },
          total: 0,
          subjectScores: null,
          subjectTotal: 0,
          whyThisSubjectOrganizesTheCluster: "",
          rejectionReason: "fixture: on the reject list",
        };
      }

      this.subjects += 1;
      const label = `fixture subject ${this.subjects} (${packet.clusterId})`;
      const bears = bearing.size === 0 ? true : bearing.has(packet.clusterId);

      return {
        clusterId: packet.clusterId,
        subject: {
          id: `subject-${this.subjects}`,
          label,
          type: "institution" as const,
          centralPageTitle: packet.topByRelevance[0]?.title ?? null,
          synthesized: false,
          constitutivePages: packet.representativeTitles.slice(0, 3),
          peripheralPages: packet.anomalies,
          audienceAnchor: anchorless.has(label)
            ? ""
            : `fixture anchor from ${packet.concreteAnchorTitles[0] ?? packet.representativeTitles[0] ?? "the cluster"}`,
        },
        scores: {
          ...ZERO_CLUSTER,
          deficiencyFit: bears ? 0.9 : 0.1,
          subjectEmergencePotential: bears ? 0.8 : 0.1,
          immanentTransitionStrength: bears ? 0.75 : 0.1,
          clusterStability: 0.6,
          complementarity: packet.complementarity,
          historicalSpecificity: 0.7,
          narrativePivotPotential: 0.6,
          personalizedRelevance: 0.6,
          audienceIntelligibility: packet.audienceIntelligibility,
          concreteAnchorStrength: packet.concreteAnchorTitles.length > 0 ? 0.7 : 0.1,
          attentionProgramFit: packet.attentionFit,
          surprise: 0.4 - index * 0.05,
          endpointReturnPotential: 0.5,
          weakDeficiencyRelation: bears ? 0.1 : 0.8,
          genericAbstraction: 0.1,
        },
        total: 0,
        subjectScores: {
          ...ZERO_SUBJECT,
          deficiencyResolution: bears ? 0.9 : 0.1,
          clusterRepresentativeness: 0.8,
          predicateInstantiation: bears ? 0.8 : 0.1,
          narrativeSubjecthood: 0.7,
          historicalSpecificity: 0.7,
          immanentPivotStrength: bears ? 0.7 : 0.1,
        },
        subjectTotal: 0,
        whyThisSubjectOrganizesTheCluster: `fixture: ${label} organizes ${packet.size} pages`,
        rejectionReason: null,
      };
    });
  }

  async incipit(input: {
    previousSubject: Subject;
    narration: SubjectNarrationModel;
    deficiency: ExplanatoryDeficiency;
    newSubject: Subject;
    packet: ClusterPacket;
    seedSubject: Subject;
    rawSeed: string;
  }): Promise<IncipitSubjectum> {
    const label = input.newSubject.label;
    const unlatent = (this.script.unlatentSubjects ?? []).includes(label);
    const fabricated = (this.script.fabricatedPredicateSubjects ?? []).includes(label);
    const weak = (this.script.weakEvidenceSubjects ?? []).includes(label);
    const predicate =
      input.narration.predicates.find((p) => p.id === input.deficiency.predicateId) ??
      input.narration.predicates[0];

    return {
      previousSubjectId: input.previousSubject.id,
      previousNarrationExcerpt: input.narration.account.slice(0, 120),
      predicateId: fabricated ? "p-does-not-exist" : predicate.id,
      predicateAsPreviouslyNarrated: predicate.text,
      deficiencyId: input.deficiency.id,
      deficiencyStatement: input.deficiency.deficiencyStatement,
      newSubjectId: input.newSubject.id,
      newSubjectLabel: label,
      subjectEmergenceExplanation: unlatent
        ? "vague"
        : `fixture: ${label} makes explicit the mechanism that ${input.previousSubject.label} could only invoke in passing`,
      seedQuestionRelation:
        "fixture: the new subject still bears on the seed's question because the fixture says so",
      seedFidelity: 0.8,
      whyLatentInPreviousNarration: unlatent
        ? "related"
        : `fixture: the account of ${input.previousSubject.label} already relied on ${predicate.text} without explaining it`,
      pivotType: "PRECONDITION",
      archivalSupport: input.packet.representativeTitles.slice(0, 2),
      narrativeBridge: unlatent
        ? "They are related."
        : `fixture bridge: the account of ${input.previousSubject.label} leaned on a determination it never explained, and ${label} is where that determination becomes a historical subject in its own right.`,
      evidentiaryStatus: weak ? "structural analogy" : "historical precondition",
      confidence: weak ? 0.4 : 0.8,
    };
  }

  async wrapAround(input: {
    seedSubject: Subject;
    seedNarration: SubjectNarrationModel | null;
    firstPresentedSubject: Subject;
    accepted: AcceptedSubjectCluster[];
    attention: AttentionProgram;
  }): Promise<WrapAround> {
    return {
      everydaySceneTitle: input.seedSubject.centralPageTitle ?? "fixture scene",
      everydayScene: `fixture everyday scene within ${input.seedSubject.label}`,
      latentPredicate: "fixture: the ordinary description assumes something",
      initialDeficiency: "fixture: why should that assumption hold?",
      firstPresentedSubjectId: input.firstPresentedSubject.id,
      bridgeIntoFirstSubject: `fixture bridge into ${input.firstPresentedSubject.label}`,
    };
  }

  async compose(input: {
    state: BurkeClusterState;
    presentationOrder: Subject[];
    transitions: SubjectTransition[];
    wrapAround: WrapAround;
  }): Promise<BurkeClusterNarrative> {
    return {
      title: `fixture narrative for ${input.state.seed.rawInput.slice(0, 40)}`,
      opening: input.wrapAround.everydayScene,
      movements: input.presentationOrder.map((subject, i) => ({
        subjectId: subject.id,
        subjectLabel: subject.label,
        prose: `fixture movement ${i + 1} on ${subject.label}`,
        pivotProse:
          i < input.presentationOrder.length - 1
            ? `fixture pivot after ${subject.label}`
            : null,
      })),
      returnToSeed: `fixture return to ${input.state.seed.rawInput.slice(0, 40)}`,
      culmination: "fixture culmination gathering the predicates",
      orderingRationale:
        "fixture: presentation order is the reverse of discovery order",
      ledger: input.transitions.map((t) => ({
        claim: t.incipit.narrativeBridge.slice(0, 60),
        status: t.incipit.evidentiaryStatus,
      })),
    };
  }
}
