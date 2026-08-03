import type { ClusterPacket } from "@/domain/graph/packet";
import type {
  AcceptedSubjectCluster,
  AttentionProgram,
  BurkeClusterNarrative,
  BurkeClusterOracle,
  BurkeClusterState,
  ExplanatoryDeficiency,
  IncipitSubjectum,
  InterpretedCluster,
  PageReference,
  Subject,
  SubjectNarrationModel,
  SubjectTransition,
  WrapAround,
  DeficiencyScores,
} from "@/domain/burkecluster/types";
import {
  compositionSchema,
  deficiencySelectionSchema,
  incipitSchema,
  interpretationSchema,
  narrationSchema,
  seedResolutionSchema,
  wrapAroundSchema,
} from "@/schemas/burkecluster";
import { loadPrompt } from "./prompt-files";
import type { LanguageModelProvider } from "./provider";

// The judgment faculty for BurkeCluster. Graph measurements travel with
// every packet, explicitly marked advisory: they say where the archive is
// concentrated, never what a subject is.

function attentionBlock(attention: AttentionProgram): string {
  return [
    `ATTENTION PROGRAM: ${attention.rawText}`,
    `  salience: ${attention.salienceTerms.map((t) => `${t.term} ${"+".repeat(Math.max(1, Math.round(t.weight)))}`).join(", ")}`,
    attention.desiredTensions.length > 0
      ? `  tensions sought: ${attention.desiredTensions.join("; ")}`
      : "",
    attention.avoidPatterns.length > 0
      ? `  AVOID: ${attention.avoidPatterns.join("; ")}`
      : "",
    `  audience: ages ${attention.audienceProfile.targetAgeMin}–${attention.audienceProfile.targetAgeMax}, concrete anchors ${attention.audienceProfile.requireConcreteAnchor ? "required" : "preferred"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function subjectBlock(subject: Subject): string {
  return [
    `SUBJECT: ${subject.label} (${subject.type}${subject.synthesized ? ", synthesized" : ""})`,
    subject.centralPageTitle ? `  central page: ${subject.centralPageTitle}` : "",
    `  warranting pages: ${subject.constitutivePages.join(", ")}`,
    subject.audienceAnchor ? `  anchor: ${subject.audienceAnchor}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function packetBlock(packet: ClusterPacket): string {
  return [
    `CLUSTER ${packet.clusterId} — ${packet.size} pages`,
    `  measurements (ADVISORY): density ${packet.density.toFixed(2)}, conductance ${packet.conductance.toFixed(2)}, modularity ${packet.modularityContribution.toFixed(3)}, complementarity ${packet.complementarity.toFixed(2)}, intelligibility ${packet.audienceIntelligibility.toFixed(2)}, attention fit ${packet.attentionFit.toFixed(2)}, deficiency-term hits ${packet.deficiencyTermHits.toFixed(2)}`,
    `  most relevant: ${packet.topByRelevance.map((p) => `${p.title} (ppr ${p.ppr.toFixed(3)})`).join(", ")}`,
    `  most central within cluster: ${packet.topByCentrality.join(", ")}`,
    packet.bridges.length > 0 ? `  bridges: ${packet.bridges.join(", ")}` : "",
    `  members: ${packet.representativeTitles.join(", ")}`,
    packet.recurringEntityTypes.length > 0
      ? `  entity types: ${packet.recurringEntityTypes.join(", ")}`
      : "",
    `  periods: ${packet.periods}`,
    packet.places.length > 0 ? `  places: ${packet.places.join("; ")}` : "",
    `  dominant relations: ${packet.dominantRelations.join(", ") || "none"}`,
    packet.concreteAnchorTitles.length > 0
      ? `  concrete anchors available: ${packet.concreteAnchorTitles.join(", ")}`
      : "  concrete anchors available: NONE",
    packet.anomalies.length > 0
      ? `  weakly connected (possible traversal artifacts): ${packet.anomalies.join(", ")}`
      : "",
    `  LEADS:\n${packet.topByRelevance.map((p) => `    ${p.title}: ${p.summary}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function narrationBlock(narration: SubjectNarrationModel): string {
  return [
    `ACCOUNT OF ${narration.subjectLabel}:`,
    narration.account,
    `PREDICATES USED:`,
    narration.predicates
      .map(
        (p) =>
          `  [${p.id}] (${p.predicateType}, importance ${p.importanceToSubject.toFixed(2)}, completeness ${p.explanatoryCompleteness.toFixed(2)}) ${p.text}`,
      )
      .join("\n"),
  ].join("\n");
}

export class LlmBurkeClusterOracle implements BurkeClusterOracle {
  constructor(private readonly provider: LanguageModelProvider) {}

  async resolveSeed(input: {
    rawSeed: string;
    attentionText: string;
    candidates: Array<{ title: string; summary: string }>;
  }): Promise<{
    seedPages: PageReference[];
    attention: AttentionProgram;
    seedSubject: Subject;
  }> {
    const result = await this.provider.generateStructured({
      promptId: "burkecluster-resolve-seed.v1",
      system: loadPrompt("burkecluster-resolve-seed.v1"),
      user: [
        `SEED: "${input.rawSeed}"`,
        `ATTENTION TEXT:\n${input.attentionText || "(none given — derive from the seed)"}`,
        `CANDIDATE PAGES:\n${input.candidates.map((c, i) => `${i + 1}. ${c.title}\n   ${c.summary}`).join("\n")}`,
      ].join("\n\n"),
      schema: seedResolutionSchema,
    });

    return {
      seedPages: result.seedPages as PageReference[],
      attention: {
        rawText: input.attentionText,
        salienceTerms: result.attention.salienceTerms,
        preferredHistoricalRelations:
          result.attention.preferredHistoricalRelations,
        preferredSubjectTypes:
          result.attention.preferredSubjectTypes as AttentionProgram["preferredSubjectTypes"],
        desiredTensions: result.attention.desiredTensions,
        avoidPatterns: result.attention.avoidPatterns,
        audienceProfile: {
          targetAgeMin: 10,
          targetAgeMax: 16,
          requireConcreteAnchor: true,
          maxAbstractClustersInSequence: 1,
        },
      },
      seedSubject: result.seedSubject as Subject,
    };
  }

  async narrate(input: {
    subject: Subject;
    packet: ClusterPacket | null;
    passages: Array<{ title: string; summary: string }>;
    attention: AttentionProgram;
    seedLabel: string;
  }): Promise<SubjectNarrationModel> {
    const result = await this.provider.generateStructured({
      promptId: "burkecluster-narrate.v1",
      system: loadPrompt("burkecluster-narrate.v1"),
      user: [
        subjectBlock(input.subject),
        attentionBlock(input.attention),
        `THE ROUTE CULMINATES IN: ${input.seedLabel}`,
        input.packet ? packetBlock(input.packet) : "",
        `PAGES:\n${input.passages.map((p) => `  ${p.title}: ${p.summary}`).join("\n")}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: narrationSchema,
    });

    return {
      subjectId: input.subject.id,
      subjectLabel: input.subject.label,
      subjectType: input.subject.type,
      narrativeClaim: result.narrativeClaim,
      account: result.account,
      predicates: result.predicates,
      deficiencies: result.deficiencies.map((d) => ({
        ...d,
        subjectId: input.subject.id,
        impliedSubjectTypes:
          d.impliedSubjectTypes as ExplanatoryDeficiency["impliedSubjectTypes"],
        status: "open" as const,
      })),
      strongestDeficiencyId: result.deficiencies[0]?.id ?? null,
      provisionalClosingSentence: result.provisionalClosingSentence,
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
    return this.provider.generateStructured({
      promptId: "burkecluster-select-deficiency.v1",
      system: loadPrompt("burkecluster-select-deficiency.v1"),
      user: [
        narrationBlock(input.narration),
        `DEFICIENCIES:\n${input.narration.deficiencies
          .map(
            (d) =>
              `  [${d.id}] (${d.deficiencyType}) ${d.deficiencyStatement}\n     matters because: ${d.whyItMatters}`,
          )
          .join("\n")}`,
        attentionBlock(input.attention),
        `THE ROUTE CULMINATES IN: ${input.seedLabel}`,
        input.alreadyDiscovered.length > 0
          ? `ALREADY DISCOVERED (do not send the walk back here): ${input.alreadyDiscovered.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: deficiencySelectionSchema,
    });
  }

  async interpretClusters(input: {
    packets: ClusterPacket[];
    deficiency: ExplanatoryDeficiency;
    currentSubject: Subject;
    narration: SubjectNarrationModel;
    attention: AttentionProgram;
    alreadyDiscovered: string[];
  }): Promise<InterpretedCluster[]> {
    const result = await this.provider.generateStructured({
      promptId: "burkecluster-interpret.v1",
      system: loadPrompt("burkecluster-interpret.v1"),
      user: [
        subjectBlock(input.currentSubject),
        narrationBlock(input.narration),
        `THE DEFICIENCY DIRECTING THIS SEARCH:\n  [${input.deficiency.id}] ${input.deficiency.deficiencyStatement}\n  why it matters: ${input.deficiency.whyItMatters}`,
        attentionBlock(input.attention),
        input.alreadyDiscovered.length > 0
          ? `ALREADY ACCEPTED SUBJECTS (a duplicate is a rejection): ${input.alreadyDiscovered.join(", ")}`
          : "",
        `CANDIDATE CLUSTERS:\n${input.packets.map(packetBlock).join("\n\n")}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: interpretationSchema,
    });

    return result.interpretations.map((entry) => ({
      clusterId: entry.clusterId,
      subject: entry.subject as Subject | null,
      scores: entry.scores,
      total: 0,
      subjectScores: entry.subjectScores,
      subjectTotal: 0,
      whyThisSubjectOrganizesTheCluster: entry.whyThisSubjectOrganizesTheCluster ?? "",
      rejectionReason: entry.rejectionReason,
    }));
  }

  async incipit(input: {
    previousSubject: Subject;
    narration: SubjectNarrationModel;
    deficiency: ExplanatoryDeficiency;
    newSubject: Subject;
    packet: ClusterPacket;
  }): Promise<IncipitSubjectum> {
    const result = await this.provider.generateStructured({
      promptId: "burkecluster-incipit.v1",
      system: loadPrompt("burkecluster-incipit.v1"),
      user: [
        `PREVIOUS ${subjectBlock(input.previousSubject)}`,
        narrationBlock(input.narration),
        `DEFICIENCY:\n  [${input.deficiency.id}] ${input.deficiency.deficiencyStatement}`,
        `NEW ${subjectBlock(input.newSubject)}`,
        packetBlock(input.packet),
      ].join("\n\n"),
      schema: incipitSchema,
    });

    return {
      previousSubjectId: input.previousSubject.id,
      previousNarrationExcerpt: result.previousNarrationExcerpt,
      predicateId: result.predicateId,
      predicateAsPreviouslyNarrated: result.predicateAsPreviouslyNarrated,
      deficiencyId: input.deficiency.id,
      deficiencyStatement: input.deficiency.deficiencyStatement,
      newSubjectId: input.newSubject.id,
      newSubjectLabel: input.newSubject.label,
      subjectEmergenceExplanation: result.subjectEmergenceExplanation,
      whyLatentInPreviousNarration: result.whyLatentInPreviousNarration,
      seedQuestionRelation: result.seedQuestionRelation,
      seedFidelity: result.seedFidelity,
      pivotType: result.pivotType,
      archivalSupport: result.archivalSupport,
      narrativeBridge: result.narrativeBridge,
      evidentiaryStatus: result.evidentiaryStatus,
      confidence: result.confidence,
    };
  }

  async wrapAround(input: {
    seedSubject: Subject;
    seedNarration: SubjectNarrationModel | null;
    firstPresentedSubject: Subject;
    accepted: AcceptedSubjectCluster[];
    attention: AttentionProgram;
  }): Promise<WrapAround> {
    const result = await this.provider.generateStructured({
      promptId: "burkecluster-wrap-around.v1",
      system: loadPrompt("burkecluster-wrap-around.v1"),
      user: [
        `SEED ${subjectBlock(input.seedSubject)}`,
        input.seedNarration ? narrationBlock(input.seedNarration) : "",
        `FIRST PRESENTED ${subjectBlock(input.firstPresentedSubject)}`,
        `ROUTE (discovery order): ${input.accepted.map((a) => a.subject.label).join(" → ")}`,
        `ANCHORS AVAILABLE: ${input.accepted.flatMap((a) => a.packet.concreteAnchorTitles).slice(0, 10).join(", ")}`,
        attentionBlock(input.attention),
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: wrapAroundSchema,
    });

    return {
      ...result,
      firstPresentedSubjectId: input.firstPresentedSubject.id,
    };
  }

  async compose(input: {
    state: BurkeClusterState;
    presentationOrder: Subject[];
    transitions: SubjectTransition[];
    wrapAround: WrapAround;
  }): Promise<BurkeClusterNarrative> {
    const result = await this.provider.generateStructured({
      promptId: "burkecluster-compose.v1",
      system: loadPrompt("burkecluster-compose.v1"),
      user: [
        `SEED: "${input.state.seed.rawInput}"`,
        attentionBlock(input.state.attention),
        `OPENING SCENE (use this):\n  ${input.wrapAround.everydayScene}\n  latent predicate: ${input.wrapAround.latentPredicate}\n  initial deficiency: ${input.wrapAround.initialDeficiency}\n  bridge into the first subject: ${input.wrapAround.bridgeIntoFirstSubject}`,
        `PRESENTATION ORDER:\n${input.presentationOrder.map((s, i) => `  ${i + 1}. ${s.label} (${s.type}) — anchor: ${s.audienceAnchor}`).join("\n")}`,
        `DISCOVERY ORDER (for reference): ${input.state.acceptedClusters.map((a) => a.subject.label).join(" → ")}`,
        `PIVOTS (use these bridges):\n${input.transitions
          .map(
            (t) =>
              `  ${t.incipit.newSubjectLabel} ← ${t.incipit.pivotType}\n     predicate: ${t.incipit.predicateAsPreviouslyNarrated}\n     deficiency: ${t.incipit.deficiencyStatement}\n     bridge: ${t.incipit.narrativeBridge}\n     status: ${t.incipit.evidentiaryStatus}`,
          )
          .join("\n")}`,
        `SUBJECT ACCOUNTS:\n${input.state.acceptedClusters
          .map((a) => `  ${a.subject.label}: ${a.narration?.account ?? "(not narrated)"}`)
          .join("\n")}`,
      ].join("\n\n"),
      schema: compositionSchema,
    });
    return result as BurkeClusterNarrative;
  }
}
