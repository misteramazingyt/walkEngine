import type { SeededRng } from "@/domain/walk/prng";
import {
  RequestBudgetExhaustedError,
  type EntityFactsGateway,
  type WalkGateway,
} from "@/domain/walk/types";
import type { StrategyProgress } from "@/domain/walk/strategy";
import { WEAK_EVIDENCE_STATUSES } from "@/domain/explanation/types";
import { sampleArchive, type SamplingConfig } from "@/domain/graph/sampler";
import { computeMetrics } from "@/domain/graph/metrics";
import { detectClusters } from "@/domain/graph/cluster";
import { buildClusterPacket, type ClusterPacket } from "@/domain/graph/packet";
import {
  DEFAULT_POLICY_MIX,
  DEFICIENCY_POLICY_MIX,
  type ArchiveEdge,
  type ArchiveNode,
} from "@/domain/graph/types";
import { deficiencyBearing, scoreCluster, scoreSubject } from "./scoring";
import type {
  AcceptedSubjectCluster,
  BurkeClusterEndReason,
  BurkeClusterOracle,
  BurkeClusterResult,
  BurkeClusterState,
  ExplanatoryDeficiency,
  InterpretedCluster,
  SamplingCycleRecord,
  Subject,
  SubjectNarrationModel,
  SubjectTransition,
} from "./types";

// The BurkeCluster engine.
//
// Per cycle, in this order and no other:
//   1. NARRATE    — give a compact account of the current subject.
//   2. PREDICATES — extract the determinations that account used.
//   3. DEFICIENCY — find what those predicates leave unexplained, rank them,
//                   and select ONE. This happens BEFORE any sampling: a
//                   cluster may never be chosen first and its deficiency
//                   invented afterwards.
//   4. SAMPLE     — stochastic walk episodes conditioned on the deficiency.
//   5. CLUSTER    — multi-resolution community detection over the sample.
//   6. INTERPRET  — which concentration bears a subject for the deficiency?
//   7. INCIPIT    — raise the deficient predicate into the next subject, with
//                   a bridge that names why it was latent all along.
//   8. VALIDATE   — a pivot that cannot state its latency is rejected.
//
// Randomness supplies variation; the archive supplies bounds; clustering
// supplies concentrations; the deficiency supplies direction.

export interface BurkeClusterEngineConfig {
  rawSeed: string;
  attentionText: string;
  // A start the user named explicitly, already resolved to a real title.
  // The seed region is otherwise the model's to choose: this page is pinned
  // into it as the first entry and offered to the oracle as a candidate, but
  // the oracle still assembles the rest of the region and names the subject,
  // which must then account for the pinned page like any other.
  pinnedSeedTitle?: string;
  minimumSubjectCount: number;
  maxSubjectDepth: number;
  // Sampling
  episodesPerCycle: number;
  hopsPerEpisode: number;
  restartProbability: number;
  maxNodesPerCycle: number;
  maxEdgesPerCycle: number;
  secondOrderFanout: number;
  sharedNeighborThreshold: number;
  minArticleLength: number;
  excludeMetaPages: boolean;
  minClusterSize: number;
  // Judgment
  analogyTolerance: number;
  endpointRigidity: number;
  requireConcreteAnchor: boolean;
  // Budgets
  maxClusterCycles: number;
  maxModelCalls: number;
}

const CLUSTER_SHORTLIST = 5;
const SUBJECT_ATTEMPTS = 3;
const LOW_BEARING_THRESHOLD = 0.35;

export async function runBurkeClusterWalk(options: {
  wikipedia: WalkGateway;
  entityFacts?: EntityFactsGateway;
  oracle: BurkeClusterOracle;
  rng: SeededRng;
  config: BurkeClusterEngineConfig;
  onProgress?: (progress: StrategyProgress) => void | Promise<void>;
}): Promise<BurkeClusterResult> {
  const { wikipedia, entityFacts, oracle, rng, config } = options;

  let modelCalls = 0;
  let finalNodes: ArchiveNode[] = [];
  let finalEdges: ArchiveEdge[] = [];
  const packetsBySubject = new Map<string, ClusterPacket>();

  const report = async (stage: string, current: string, completed: number) => {
    await options.onProgress?.({
      stage,
      currentTitle: current,
      completed,
      target: config.minimumSubjectCount,
      requestsUsed: wikipedia.requestsUsed(),
    });
  };

  const state: BurkeClusterState = {
    seed: {
      rawInput: config.rawSeed,
      resolvedPages: [],
      fixedNarrativeEndpoint: true,
      endpointRevisions: [],
    },
    attention: {
      rawText: config.attentionText,
      salienceTerms: [],
      preferredHistoricalRelations: [],
      preferredSubjectTypes: [],
      desiredTensions: [],
      avoidPatterns: [],
      audienceProfile: {
        targetAgeMin: 10,
        targetAgeMax: 16,
        requireConcreteAnchor: config.requireConcreteAnchor,
        maxAbstractClustersInSequence: 1,
      },
    },
    currentSubject: null,
    acceptedClusters: [],
    transitions: [],
    rejectedClusters: [],
    rejectedSubjects: [],
    cycles: [],
    discoveryOrder: [],
    dependencyOrder: [],
    presentationOrder: [],
    wrapAround: null,
    budget: {
      sampledPages: 0,
      edges: 0,
      walkEpisodes: 0,
      clusterCycles: 0,
      modelCalls: 0,
      httpRequests: 0,
    },
  };

  const finish = async (
    endReason: BurkeClusterEndReason,
  ): Promise<BurkeClusterResult> => {
    state.budget.modelCalls = modelCalls;
    state.budget.httpRequests = wikipedia.requestsUsed();

    // Presentation order: reverse of discovery, ending on the seed. The
    // oracle may justify departures during composition.
    const discovered = state.acceptedClusters.map((c) => c.subject);
    const reversed = [...discovered].reverse();
    state.dependencyOrder = reversed.map((s) => s.id);
    state.presentationOrder = [
      ...reversed.map((s) => s.id),
      state.seed.resolvedPages.length > 0 ? "seed" : "seed",
    ];

    let narrative = null;
    if (discovered.length > 0 && seedSubject) {
      await report("Composing", seedSubject.label, discovered.length);
      const wrapAround = await oracle.wrapAround({
        seedSubject,
        seedNarration: seedNarration,
        firstPresentedSubject: reversed[0],
        accepted: state.acceptedClusters,
        attention: state.attention,
      });
      modelCalls += 1;
      state.wrapAround = wrapAround;

      narrative = await oracle.compose({
        state,
        presentationOrder: [...reversed, seedSubject],
        transitions: state.transitions,
        wrapAround,
      });
      modelCalls += 1;
      state.budget.modelCalls = modelCalls;
    }

    const transitionTable = state.transitions.map((t) => ({
      previousSubject:
        state.acceptedClusters.find((c) => c.subject.id === t.fromSubjectId)
          ?.subject.label ??
        seedSubject?.label ??
        t.fromSubjectId,
      predicateIntroduced: t.incipit.predicateAsPreviouslyNarrated,
      deficiency: t.incipit.deficiencyStatement,
      newSubject: t.incipit.newSubjectLabel,
      whyLatent: t.incipit.whyLatentInPreviousNarration,
      pivotEvidence: t.incipit.archivalSupport.join("; "),
      confidence: t.incipit.confidence,
    }));

    return {
      state,
      narrative,
      transitionTable,
      finalNodes,
      finalEdges,
      endReason,
      requestsUsed: wikipedia.requestsUsed(),
    };
  };

  let seedSubject: Subject | null = null;
  let seedNarration: SubjectNarrationModel | null = null;

  try {
    // ---- Stage 1: seed resolution -----------------------------------------
    await report("Resolving the seed region", config.rawSeed, 0);
    const searchCandidates: Array<{ title: string; summary: string }> = [];
    const seen = new Set<string>();
    const pinnedTitle = config.pinnedSeedTitle?.trim() ?? "";
    if (pinnedTitle.length > 0) seen.add(pinnedTitle);
    if (wikipedia.searchTitles) {
      // The seed is always searched, whatever its length. The length filter
      // applies only to the attention program's clauses, where splitting on
      // [;.] leaves fragments too short to search usefully — applying it to
      // the seed as well silently dropped every seed of eight characters or
      // fewer ("carnival", "radar"), leaving no candidates at all and
      // failing with a message that blamed Wikipedia for the omission.
      const attentionClauses = config.attentionText
        .split(/[;.]/)
        .map((p) => p.trim())
        .filter((p) => p.length > 8);
      const phrases = [config.rawSeed.trim(), ...attentionClauses]
        .filter((p) => p.length > 0)
        .slice(0, 3);
      for (const phrase of phrases) {
        for (const title of await wikipedia.searchTitles(phrase, 6)) {
          if (!seen.has(title)) seen.add(title);
        }
      }
    }
    const candidateInfos = await wikipedia.getArticleInfos([...seen].slice(0, 20));
    for (const [, info] of candidateInfos) {
      if (info.missing || info.isDisambiguation || info.summary.length === 0) {
        continue;
      }
      searchCandidates.push({
        title: info.title,
        summary: info.summary.slice(0, 400),
      });
    }
    if (searchCandidates.length === 0) {
      throw new Error(
        `No Wikipedia pages could be found for the seed "${config.rawSeed}"`,
      );
    }
    // A pinned start that cannot anchor a seed region — missing, a
    // disambiguation page, no lead summary — fails here. Quietly beginning
    // somewhere else would misreport whose choice the starting point was.
    if (
      pinnedTitle.length > 0 &&
      !searchCandidates.some((c) => c.title === pinnedTitle)
    ) {
      throw new Error(
        `The specified start "${pinnedTitle}" cannot anchor a seed region — it is missing, a disambiguation page, or has no lead summary`,
      );
    }

    const resolution = await oracle.resolveSeed({
      rawSeed: config.rawSeed,
      attentionText: config.attentionText,
      candidates: searchCandidates,
    });
    modelCalls += 1;
    // The pinned start leads the seed region whether or not the oracle chose
    // it; the oracle's own ordering governs everything after it.
    if (pinnedTitle.length > 0) {
      const chosen = resolution.seedPages.find((p) => p.title === pinnedTitle);
      resolution.seedPages = [
        chosen ?? {
          title: pinnedTitle,
          url: candidateInfos.get(pinnedTitle)?.url ?? "",
          reason:
            "Specified as the start; the seed region was assembled around it",
          score: 1,
        },
        ...resolution.seedPages.filter((p) => p.title !== pinnedTitle),
      ];
    }
    state.seed.resolvedPages = resolution.seedPages;
    state.attention = resolution.attention;
    seedSubject = resolution.seedSubject;
    state.currentSubject = seedSubject;
    state.discoveryOrder = [seedSubject.id];

    const seedTitles = resolution.seedPages.map((p) => p.title);
    if (seedTitles.length === 0) {
      throw new Error("Seed resolution returned no pages");
    }

    const attentionTerms = state.attention.salienceTerms.map((t) => t.term);

    // ---- The recursive subject loop ---------------------------------------
    let currentSubject = seedSubject;
    let currentPacket: ClusterPacket | null = null;
    let originTitles = seedTitles;
    let cycle = 0;
    let consecutiveFailures = 0;

    while (state.acceptedClusters.length < config.maxSubjectDepth) {
      if (cycle >= config.maxClusterCycles) return finish("BUDGET_EXHAUSTED");
      if (modelCalls >= config.maxModelCalls) return finish("BUDGET_EXHAUSTED");
      cycle += 1;

      // 1–2. NARRATE the current subject and extract its predicates.
      await report("Narrating the current subject", currentSubject.label, state.acceptedClusters.length);
      const passages = originTitles.slice(0, 6).map((title) => ({
        title,
        summary:
          finalNodes.find((n) => n.title === title)?.summary ??
          currentPacket?.topByRelevance.find((p) => p.title === title)?.summary ??
          "",
      }));
      const narration = await oracle.narrate({
        subject: currentSubject,
        packet: currentPacket,
        passages,
        attention: state.attention,
        seedLabel: seedSubject.label,
      });
      modelCalls += 1;
      if (currentSubject.id === seedSubject.id) seedNarration = narration;
      const accepted = state.acceptedClusters.find(
        (c) => c.subject.id === currentSubject.id,
      );
      if (accepted) accepted.narration = narration;

      if (narration.deficiencies.length === 0) {
        return finish("DIMINISHING_RETURNS");
      }

      // 3. DEFICIENCY — selected BEFORE any sampling.
      await report("Selecting the explanatory deficiency", currentSubject.label, state.acceptedClusters.length);
      const selection = await oracle.selectDeficiency({
        narration,
        attention: state.attention,
        seedLabel: seedSubject.label,
        alreadyDiscovered: state.acceptedClusters.map((c) => c.subject.label),
      });
      modelCalls += 1;
      const deficiency: ExplanatoryDeficiency =
        narration.deficiencies.find((d) => d.id === selection.deficiencyId) ??
        narration.deficiencies[0];
      deficiency.status = "cluster_searching";

      const deficiencyTerms = [
        ...deficiency.impliedSearchDomain,
        ...selection.searchTerms,
      ];

      // 4. SAMPLE — stochastic, conditioned on the deficiency.
      await report("Sampling the archive", currentSubject.label, state.acceptedClusters.length);
      const samplingConfig: SamplingConfig = {
        policyMix:
          deficiencyTerms.length > 0 ? DEFICIENCY_POLICY_MIX : DEFAULT_POLICY_MIX,
        episodes: config.episodesPerCycle,
        hopsPerEpisode: config.hopsPerEpisode,
        restartProbability: config.restartProbability,
        attentionTerms,
        deficiencyTerms,
        maxNodes: config.maxNodesPerCycle,
        maxEdges: config.maxEdgesPerCycle,
        minArticleLength: config.minArticleLength,
        excludeMetaPages: config.excludeMetaPages,
        secondOrderFanout: config.secondOrderFanout,
        sharedNeighborThreshold: config.sharedNeighborThreshold,
      };
      const archive = await sampleArchive({
        wikipedia,
        entityFacts,
        rng,
        config: samplingConfig,
        originTitles,
        visitedSubjects: new Set(
          state.acceptedClusters.map((c) => c.subject.centralPageTitle ?? ""),
        ),
      });

      state.budget.sampledPages += archive.nodes.size;
      state.budget.edges += archive.edges.length;
      state.budget.walkEpisodes += archive.episodes.length;
      state.budget.clusterCycles = cycle;
      finalNodes = [...archive.nodes.values()];
      finalEdges = archive.edges;

      // 5. CLUSTER — multi-resolution, with metrics relative to the origin.
      await report("Detecting concentrations", currentSubject.label, state.acceptedClusters.length);
      const nodeIds = [...archive.nodes.keys()];
      const metrics = computeMetrics(nodeIds, archive.edges, originTitles);
      const clustering = detectClusters({
        nodeIds,
        edges: archive.edges,
        metrics,
        minClusterSize: config.minClusterSize,
      });

      const cycleRecord: SamplingCycleRecord = {
        cycle,
        originTitles,
        deficiencyId: deficiency.id,
        deficiencyStatement: deficiency.deficiencyStatement,
        episodes: archive.episodes,
        nodesSampled: archive.nodes.size,
        edgesBuilt: archive.edges.length,
        clustering,
        interpreted: [],
        chosenClusterId: null,
        requestsUsed: archive.requestsUsed,
      };
      state.cycles.push(cycleRecord);

      if (clustering.clusters.length === 0) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 2) return finish("NO_CLUSTER_BEARS_DEFICIENCY");
        continue;
      }

      // Exclude concentrations centred on an already-accepted subject.
      const discoveredTitles = new Set(
        state.acceptedClusters
          .map((c) => c.subject.centralPageTitle)
          .filter((t): t is string => !!t),
      );
      const packets = clustering.clusters
        .filter(
          (c) =>
            !c.topByRelevance.every((t) => discoveredTitles.has(t)) &&
            c.memberIds.length >= config.minClusterSize,
        )
        .slice(0, CLUSTER_SHORTLIST)
        .map((cluster) =>
          buildClusterPacket({
            cluster,
            nodes: archive.nodes,
            edges: archive.edges,
            metrics,
            attentionTerms,
            deficiencyTerms,
          }),
        );

      if (packets.length === 0) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 2) return finish("NO_CLUSTER_BEARS_DEFICIENCY");
        continue;
      }

      // 6. INTERPRET — which concentration bears a subject for the deficiency?
      await report("Interpreting clusters as subjects", currentSubject.label, state.acceptedClusters.length);
      const interpretedRaw = await oracle.interpretClusters({
        packets,
        deficiency,
        currentSubject,
        narration,
        attention: state.attention,
        alreadyDiscovered: state.acceptedClusters.map((c) => c.subject.label),
      });
      modelCalls += 1;

      const interpreted: InterpretedCluster[] = interpretedRaw
        .map((entry) => ({
          ...entry,
          total: scoreCluster(entry.scores, {
            analogyTolerance: config.analogyTolerance,
          }),
          subjectTotal: entry.subjectScores
            ? scoreSubject(entry.subjectScores)
            : -1,
        }))
        .sort((a, b) => b.total - a.total);
      cycleRecord.interpreted = interpreted;

      // 7–8. INCIPIT SUBJECTUM, then validate the pivot.
      let acceptedThisCycle = false;
      for (const candidate of interpreted.slice(0, SUBJECT_ATTEMPTS)) {
        if (!candidate.subject) {
          state.rejectedClusters.push({
            clusterId: candidate.clusterId,
            reason: candidate.rejectionReason ?? "no coherent subject identified",
          });
          continue;
        }
        const bearing = deficiencyBearing(candidate.scores);
        if (bearing < LOW_BEARING_THRESHOLD) {
          const reason = `does not bear the deficiency (bearing ${bearing.toFixed(2)})`;
          state.rejectedClusters.push({ clusterId: candidate.clusterId, reason });
          state.rejectedSubjects.push({
            label: candidate.subject.label,
            reason,
          });
          continue;
        }

        const packet = packets.find((p) => p.clusterId === candidate.clusterId);
        if (!packet) continue;

        await report(`Testing pivot into ${candidate.subject.label}`, currentSubject.label, state.acceptedClusters.length);
        const incipit = await oracle.incipit({
          previousSubject: currentSubject,
          narration,
          deficiency,
          newSubject: candidate.subject,
          packet,
        });
        modelCalls += 1;

        // A pivot must state precisely why the new subject was already
        // latent in the previous narration. This is the governing test.
        const latency = incipit.whyLatentInPreviousNarration.trim();
        const emergence = incipit.subjectEmergenceExplanation.trim();
        const predicateExists = narration.predicates.some(
          (p) => p.id === incipit.predicateId,
        );
        const bridgeSubstantive = incipit.narrativeBridge.trim().length >= 40;

        if (!predicateExists) {
          const reason =
            "pivot cites no predicate from the previous narration (deficiency invented after the fact)";
          state.rejectedSubjects.push({ label: candidate.subject.label, reason });
          continue;
        }
        if (latency.length < 25 || emergence.length < 25) {
          const reason = "cannot state why the new subject was latent";
          state.rejectedSubjects.push({ label: candidate.subject.label, reason });
          continue;
        }
        if (!bridgeSubstantive) {
          const reason = "bridge merely asserts that the subjects are related";
          state.rejectedSubjects.push({ label: candidate.subject.label, reason });
          continue;
        }
        if (
          WEAK_EVIDENCE_STATUSES.includes(incipit.evidentiaryStatus) &&
          incipit.confidence < 0.7
        ) {
          const reason = `pivot rests on ${incipit.evidentiaryStatus} with low confidence`;
          state.rejectedSubjects.push({ label: candidate.subject.label, reason });
          continue;
        }
        if (
          config.requireConcreteAnchor &&
          candidate.subject.audienceAnchor.trim().length === 0
        ) {
          const reason = "no concrete audience anchor";
          state.rejectedSubjects.push({ label: candidate.subject.label, reason });
          continue;
        }

        // Accept.
        deficiency.status = "subject_found";
        const acceptedCluster: AcceptedSubjectCluster = {
          subject: candidate.subject,
          clusterId: candidate.clusterId,
          packet,
          narration: null,
          stability: clustering.resolutionReports.find(
            (r) => r.resolution === clustering.chosenResolution,
          )?.stability ?? 0,
          discoveryIndex: state.acceptedClusters.length,
        };
        state.acceptedClusters.push(acceptedCluster);
        packetsBySubject.set(candidate.subject.id, packet);

        const transition: SubjectTransition = {
          fromSubjectId: currentSubject.id,
          toSubjectId: candidate.subject.id,
          incipit,
        };
        state.transitions.push(transition);
        state.discoveryOrder.push(candidate.subject.id);
        cycleRecord.chosenClusterId = candidate.clusterId;

        currentSubject = candidate.subject;
        currentPacket = packet;
        state.currentSubject = candidate.subject;
        originTitles = [
          candidate.subject.centralPageTitle ?? candidate.subject.constitutivePages[0],
          ...candidate.subject.constitutivePages.slice(0, 3),
        ].filter((t): t is string => !!t);
        if (originTitles.length === 0) originTitles = packet.representativeTitles.slice(0, 2);

        acceptedThisCycle = true;
        consecutiveFailures = 0;
        break;
      }

      if (!acceptedThisCycle) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 2) {
          return finish(
            state.acceptedClusters.length >= config.minimumSubjectCount
              ? "DIMINISHING_RETURNS"
              : "NO_CLUSTER_BEARS_DEFICIENCY",
          );
        }
        continue;
      }

      if (state.acceptedClusters.length >= config.minimumSubjectCount) {
        // The sequence is long enough; stop unless depth allows more and the
        // last pivot was strong enough to promise another.
        const last = state.transitions[state.transitions.length - 1];
        if (
          state.acceptedClusters.length >= config.maxSubjectDepth ||
          (last?.incipit.confidence ?? 0) < 0.5
        ) {
          return finish("SUBJECT_SEQUENCE_COMPLETE");
        }
      }
    }

    return finish("SUBJECT_DEPTH_REACHED");
  } catch (error) {
    if (error instanceof RequestBudgetExhaustedError) {
      return finish("REQUEST_BUDGET_EXHAUSTED");
    }
    throw error;
  }
}
