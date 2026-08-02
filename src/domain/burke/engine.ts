import type { SeededRng } from "@/domain/walk/prng";
import { titleExclusionReason } from "@/domain/walk/exclusions";
import {
  RequestBudgetExhaustedError,
  type ArticleInfo,
  type WalkGateway,
  type WalkProgress,
} from "@/domain/walk/types";
import { findMotif } from "@/domain/motifs/presets";
import { DEFAULT_SCORE_WEIGHTS, explanatoryGain, scoreCandidate } from "./scoring";
import type {
  BurkeEndReason,
  BurkeNote,
  BurkeOracle,
  BurkeSeed,
  BurkeVisitedNode,
  BurkeWalkResult,
  CandidateAssessment,
  CoherenceReport,
  StoryState,
  TheoryCheckpoint,
} from "./types";

// The BurkeWalker engine, story-state centered.
//
// Control flow per step, in this order and no other:
//   1. DIAGNOSE  — what does the current account fail to explain? Choose the
//                  Burke question that addresses that deficiency and phrase
//                  one precise navigation question. No candidates yet.
//   2. GENERATE  — collect possibilities (outgoing links + searches derived
//                  from the navigation question). Generation seeks breadth.
//   3. ASSESS    — judge candidates by explanatory gain against the question.
//                  Selection seeks gain, never resemblance.
//   4. GATE      — the best candidate must pass an explicit acceptance gate
//                  and (optionally) yield a bridge that stands without
//                  mentioning the seed. Otherwise try the next candidate.
//   5. REVISE    — rewrite the theory contrastively; update questions,
//                  claims, mystery, tension.
//   6. CHECK     — theory checkpoints and coherence tests; backtrack when
//                  the branch stops producing explanatory movement.
//
// The engine owns mechanics; the oracle owns judgment. Nothing here scores
// semantic similarity, and no node is accepted because a plausible
// return-to-seed sentence could be written for it.

export interface BurkeEngineConfig {
  seed: BurkeSeed;
  priming: string;
  motif: string;
  historicalConsciousness: Record<string, boolean>;
  endpointStrategy: string;
  checkpointInterval: number;
  maxPages: number;
  branchFactor: number;
  excludeMetaPages: boolean;
  allowRevisits: boolean;
  /** No node may be accepted without a credible bridge. */
  requireMotivatedTransitions: boolean;
  /** 0 = documented dependencies only; 1 = morphology allowed (labeled). */
  analogyTolerance: number;
  /** Permit detours that open a question returning to the main thread. */
  allowProductiveDetours: boolean;
}

const SUMMARY_LIMIT = 600;
const ORACLE_CANDIDATE_LIMIT = 12;
const GATE_ATTEMPTS_PER_STEP = 3;
const COHERENCE_INTERVAL = 3;
const LOW_GAIN_THRESHOLD = 0.35;
const LOW_GAIN_STREAK_LIMIT = 2;
const COHERENCE_FLOOR = 0.45;
const SATURATION_STREAK = 2;

interface Snapshot {
  visited: BurkeVisitedNode[];
  notes: BurkeNote[];
  state: StoryState;
  visitedTitles: string[];
}

function cloneState(state: StoryState): StoryState {
  return structuredClone(state);
}

export async function runBurkeWalk(options: {
  wikipedia: WalkGateway;
  oracle: BurkeOracle;
  rng: SeededRng;
  config: BurkeEngineConfig;
  startTitle: string;
  onProgress?: (progress: WalkProgress & { stage: string }) => void | Promise<void>;
}): Promise<BurkeWalkResult> {
  const { wikipedia, oracle, rng, config, startTitle, onProgress } = options;

  const motif = findMotif(config.motif);
  let visited: BurkeVisitedNode[] = [];
  let notes: BurkeNote[] = [];
  let visitedTitles = new Set<string>();
  const checkpoints: TheoryCheckpoint[] = [];
  const coherenceReports: CoherenceReport[] = [];
  const rejectedRoutes: Array<{ title: string; reason: string }> = [];
  /** Titles that led nowhere; never immediately re-attempted. */
  const deadBranches = new Set<string>();
  const snapshots: Snapshot[] = [];
  let backtrackCount = 0;
  let lowGainStreak = 0;
  let flatCheckpointStreak = 0;

  const report = async (stage: string, currentTitle: string) => {
    await onProgress?.({
      visitedCount: visited.length,
      targetLength: config.maxPages,
      requestsUsed: wikipedia.requestsUsed(),
      currentTitle,
      stage,
    });
  };

  await report("Initializing story state", startTitle);
  const init = await oracle.initialize({
    seed: config.seed,
    priming: [
      config.priming,
      motif ? `Motif module — ${motif.name}: ${motif.sensitivity.join(", ")}. Stopping condition: ${motif.stoppingCondition}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    historicalConsciousness: config.historicalConsciousness,
    endpointStrategy: config.endpointStrategy,
    plannedLength: config.maxPages,
  });
  let state: StoryState = init.state;
  const initialTheory = state.currentTheory;

  const finish = async (endReason: BurkeEndReason): Promise<BurkeWalkResult> => {
    const narrative =
      notes.length > 0
        ? await oracle.narrate({ state, notes, checkpoints })
        : null;
    return {
      visited,
      notes,
      storyState: state,
      checkpoints,
      coherenceReports,
      narrative,
      backtrackCount,
      rejectedRoutes,
      endReason,
      requestsUsed: wikipedia.requestsUsed(),
    };
  };

  const takeSnapshot = () => {
    snapshots.push({
      visited: [...visited],
      notes: [...notes],
      state: cloneState(state),
      visitedTitles: [...visitedTitles],
    });
    // Keep the tail; deep history is not worth the memory.
    if (snapshots.length > 6) snapshots.shift();
  };

  /** Restore the most recent high-value checkpoint and kill the branch. */
  const backtrack = (deadTitle: string, reason: string): boolean => {
    const snapshot = snapshots.pop();
    if (!snapshot) return false;
    deadBranches.add(deadTitle);
    rejectedRoutes.push({ title: deadTitle, reason: `backtracked: ${reason}` });
    visited = [...snapshot.visited];
    notes = [...snapshot.notes];
    state = cloneState(snapshot.state);
    visitedTitles = new Set(snapshot.visitedTitles);
    backtrackCount += 1;
    lowGainStreak = 0;
    return true;
  };

  try {
    const startInfos = await wikipedia.getArticleInfos([startTitle]);
    const startInfo = startInfos.get(startTitle);
    if (!startInfo || startInfo.missing) {
      throw new Error(`Article not found: "${startTitle}"`);
    }
    visited.push({
      info: startInfo,
      categories: await wikipedia.getCategories(startInfo.title),
      visitIndex: 0,
      assessments: [],
      rejections: [],
    });
    visitedTitles.add(startInfo.title);
    takeSnapshot();
    await report("Walking", startInfo.title);

    while (visited.length < config.maxPages) {
      const current = visited[visited.length - 1];

      // 1. DIAGNOSE — the question comes before the candidates.
      await report("Diagnosing what remains unexplained", current.info.title);
      const diagnosis = await oracle.diagnose({
        state,
        notes,
        currentTitle: current.info.title,
      });

      // 2. GENERATE — possibilities from links and from the question itself.
      await report("Generating candidates", current.info.title);
      const linkTitles = await wikipedia.getOutgoingLinkTitles(current.info.title);
      const linkPool = rng.sample(
        [...linkTitles].sort().filter((t) => isViable(t)),
        Math.min(config.branchFactor, 18),
      );

      const searchTitles: string[] = [];
      if (wikipedia.searchTitles) {
        for (const phrase of diagnosis.searchPhrases.slice(0, 3)) {
          const found = await wikipedia.searchTitles(phrase, 5);
          for (const title of found) {
            if (isViable(title) && !searchTitles.includes(title)) {
              searchTitles.push(title);
            }
          }
        }
      }

      const poolTitles = [...new Set([...searchTitles, ...linkPool])];
      if (poolTitles.length === 0) {
        if (backtrack(current.info.title, "no viable candidates")) continue;
        return finish("PATHS_EXHAUSTED");
      }

      const infos = await fetchInfos(poolTitles);
      const candidates = poolTitles
        .map((t) => infos.get(t))
        .filter(
          (i): i is ArticleInfo =>
            !!i && !i.missing && !i.isDisambiguation && i.summary.length > 0,
        )
        .slice(0, ORACLE_CANDIDATE_LIMIT)
        .map((i) => ({
          title: i.title,
          summary: i.summary.slice(0, SUMMARY_LIMIT),
        }));
      if (candidates.length === 0) {
        if (backtrack(current.info.title, "no candidate metadata")) continue;
        return finish("PATHS_EXHAUSTED");
      }

      // 3. ASSESS — explanatory gain against the navigation question.
      await report("Judging explanatory gain", current.info.title);
      const rawAssessments = await oracle.assess({
        state,
        navigationQuestion: diagnosis.navigationQuestion,
        burkeQuestion: diagnosis.burkeQuestion,
        currentTitle: current.info.title,
        candidates,
      });

      const assessments: CandidateAssessment[] = rawAssessments
        .filter((a) => candidates.some((c) => c.title === a.title))
        .map((a) => ({
          ...a,
          // An analogy without a named carrier is not an analogy; it is a
          // resemblance. Penalize it as such regardless of what was claimed.
          scores: {
            ...a.scores,
            analogyOnlyPenalty:
              a.relationType === "structural analogy" &&
              (!a.analogyCarrier || a.analogyCarrier.trim().length === 0)
                ? Math.max(a.scores.analogyOnlyPenalty, 0.9)
                : a.scores.analogyOnlyPenalty,
          },
          total: 0,
        }))
        .map((a) => ({
          ...a,
          total: scoreCandidate(a.scores, {
            analogyTolerance: config.analogyTolerance,
            weights: DEFAULT_SCORE_WEIGHTS,
          }),
        }))
        .sort((a, b) => b.total - a.total);

      if (assessments.length === 0) {
        if (backtrack(current.info.title, "no assessable candidates")) continue;
        return finish("NO_CANDIDATE_PASSES_GATE");
      }

      // 4. GATE — try the strongest candidates in order until one passes.
      const stepRejections: Array<{ title: string; reason: string }> = [];
      let accepted:
        | {
            assessment: CandidateAssessment;
            info: ArticleInfo;
            gate: Awaited<ReturnType<BurkeOracle["gate"]>>;
          }
        | null = null;

      for (const assessment of assessments.slice(0, GATE_ATTEMPTS_PER_STEP)) {
        if (deadBranches.has(assessment.title)) {
          stepRejections.push({
            title: assessment.title,
            reason: "already explored and abandoned",
          });
          continue;
        }
        const info = infos.get(assessment.title);
        const candidate = candidates.find((c) => c.title === assessment.title);
        if (!info || !candidate) continue;

        await report(`Gating ${assessment.title}`, current.info.title);
        const result = await oracle.gate({
          state,
          navigationQuestion: diagnosis.navigationQuestion,
          previousTitle: current.info.title,
          candidate,
          assessment,
          requireBridge: config.requireMotivatedTransitions,
        });

        const gatePassed =
          result.gate.verdict === "accept" &&
          result.gate.strongerThanResemblance &&
          result.gate.contributionKind !== "none" &&
          (result.gate.answersHighPriorityQuestion ||
            result.gate.invalidatesPartOfTheory ||
            result.gate.revealsDeeperPrecondition ||
            result.gate.introducesConsequentialAlternative ||
            result.gate.createsStrongerNarrativePivot ||
            result.gate.enablesImprovedRecoding);

        if (!gatePassed) {
          const reason =
            result.gate.rejectionReason ??
            "no gate criterion satisfied (resemblance only)";
          stepRejections.push({ title: assessment.title, reason });
          rejectedRoutes.push({ title: assessment.title, reason });
          continue;
        }

        // A required bridge must exist AND stand without invoking the seed.
        if (config.requireMotivatedTransitions) {
          if (!result.bridge || !result.bridge.standsWithoutSeed) {
            const reason = "no motivated transition could be written";
            stepRejections.push({ title: assessment.title, reason });
            rejectedRoutes.push({ title: assessment.title, reason });
            continue;
          }
        }

        // Detours are permitted only when explicitly allowed and only when
        // they open a question — never merely because they are interesting.
        if (
          !config.allowProductiveDetours &&
          result.gate.addressedQuestionId === null &&
          !result.gate.invalidatesPartOfTheory &&
          !result.gate.revealsDeeperPrecondition
        ) {
          const reason = "detour: addresses no open question";
          stepRejections.push({ title: assessment.title, reason });
          rejectedRoutes.push({ title: assessment.title, reason });
          continue;
        }

        accepted = { assessment, info, gate: result };
        break;
      }

      if (!accepted) {
        if (backtrack(current.info.title, "no candidate passed the gate")) {
          continue;
        }
        current.rejections.push(...stepRejections);
        return finish("NO_CANDIDATE_PASSES_GATE");
      }

      // 5. REVISE — contrastive theory revision, then commit the node.
      await report("Revising theory", accepted.info.title);
      const revision = await oracle.revise({
        state,
        acceptedTitle: accepted.info.title,
        evidence: accepted.assessment.predictedClaim,
        gate: accepted.gate.gate,
        step: visited.length,
      });

      const note: BurkeNote = {
        ...revision.note,
        step: visited.length,
        currentUnresolvedQuestion: diagnosis.deficiency,
        selectedBurkeQuestion: diagnosis.burkeQuestion,
        navigationQuestion: diagnosis.navigationQuestion,
        articleTitle: accepted.info.title,
        theoryBefore: state.currentTheory,
        theoryAfter: revision.theoryVersion.theory,
        bridge: accepted.gate.bridge
          ? {
              ...accepted.gate.bridge,
              fromTitle: current.info.title,
              toTitle: accepted.info.title,
            }
          : null,
      };
      notes.push(note);

      state = {
        ...state,
        currentTheory: revision.theoryVersion.theory,
        theoryVersions: [...state.theoryVersions, revision.theoryVersion],
        unresolvedQuestions: applyQuestionUpdates(
          state.unresolvedQuestions,
          revision.questionUpdates,
          revision.newQuestions,
        ),
        establishedClaims: [...state.establishedClaims, ...revision.claims],
        mystery: revision.mystery,
        currentTension: revision.currentTension,
        returnPaths: revision.returnPaths,
      };

      visited.push({
        info: accepted.info,
        categories: await wikipedia.getCategories(accepted.info.title),
        visitIndex: visited.length,
        note,
        assessments,
        rejections: stepRejections,
      });
      visitedTitles.add(accepted.info.title);
      await report("Walking", accepted.info.title);

      // Track explanatory movement: two weak nodes in a row means the
      // branch is collecting fragments rather than building an account.
      const gain = explanatoryGain(accepted.assessment.scores);
      const flatTheory = revision.theoryVersion.changeType === "additive";
      if (gain < LOW_GAIN_THRESHOLD && flatTheory) {
        lowGainStreak += 1;
        if (lowGainStreak >= LOW_GAIN_STREAK_LIMIT) {
          if (backtrack(accepted.info.title, "two successive low-gain nodes")) {
            continue;
          }
        }
      } else {
        lowGainStreak = 0;
        takeSnapshot();
      }

      // 6a. Thread coherence, every few accepted nodes.
      if (notes.length > 0 && notes.length % COHERENCE_INTERVAL === 0) {
        await report("Testing thread coherence", accepted.info.title);
        const coherence = await oracle.coherence({ state, notes });
        coherenceReports.push({ ...coherence, step: visited.length });
        const incoherent =
          coherence.score < COHERENCE_FLOOR ||
          coherence.sensationalHijack ||
          !coherence.eachNodeArisesFromPriorDeficiency;
        if (incoherent) {
          if (
            backtrack(
              accepted.info.title,
              coherence.sensationalHijack
                ? "sensational detour hijacked the thread"
                : `thread coherence ${coherence.score.toFixed(2)}: ${coherence.diagnosis}`,
            )
          ) {
            continue;
          }
        }
      }

      // 6b. Theory checkpoint — replaces summary-style elasticity.
      if (notes.length > 0 && notes.length % config.checkpointInterval === 0) {
        await report("Theory checkpoint", accepted.info.title);
        const previous = checkpoints[checkpoints.length - 1] ?? null;
        const result = await oracle.checkpoint({
          state,
          notes,
          previousCheckpoint: previous,
        });
        checkpoints.push({
          ...result,
          version: checkpoints.length + 1,
          afterAcceptedNodes: notes.length,
        });

        const flat =
          result.changeClass === "none" ||
          result.changeClass === "minor elaboration";
        flatCheckpointStreak = flat ? flatCheckpointStreak + 1 : 0;
        if (flatCheckpointStreak >= SATURATION_STREAK) {
          return finish("EXPLANATORY_SATURATION");
        }
      }

      // Stopping conditions, in order of authority. Redescription is the
      // point of the walk; resolved questions are the second-best ending.
      // Neither fires unless the theory actually moved from where it began.
      const theoryMoved = state.currentTheory !== initialTheory;

      if (accepted.gate.gate.enablesImprovedRecoding && theoryMoved) {
        const strongReturn = state.returnPaths.some((p) => p.strength >= 0.8);
        if (strongReturn && notes.length >= 4) {
          return finish("REDESCRIPTION_ACHIEVED");
        }
      }

      const openHighPriority = state.unresolvedQuestions.filter(
        (q) => q.status === "open" && q.priority >= 0.6,
      );
      if (openHighPriority.length === 0 && theoryMoved && notes.length >= 3) {
        return finish("QUESTIONS_RESOLVED");
      }
    }

    return finish("PAGE_CAP_REACHED");
  } catch (error) {
    if (error instanceof RequestBudgetExhaustedError) {
      return finish("REQUEST_BUDGET_EXHAUSTED");
    }
    throw error;
  }

  function isViable(title: string): boolean {
    if (titleExclusionReason(title, config)) return false;
    if (!config.allowRevisits && visitedTitles.has(title)) return false;
    if (deadBranches.has(title)) return false;
    return true;
  }

  async function fetchInfos(titles: string[]): Promise<Map<string, ArticleInfo>> {
    const result = new Map<string, ArticleInfo>();
    for (let i = 0; i < titles.length; i += 20) {
      const batch = await wikipedia.getArticleInfos(titles.slice(i, i + 20));
      for (const [t, info] of batch) result.set(t, info);
    }
    return result;
  }
}

function applyQuestionUpdates(
  questions: StoryState["unresolvedQuestions"],
  updates: Array<{
    id: string;
    status: StoryState["unresolvedQuestions"][number]["status"];
    answerSummary: string | null;
  }>,
  additions: StoryState["unresolvedQuestions"],
): StoryState["unresolvedQuestions"] {
  const byId = new Map(questions.map((q) => [q.id, { ...q }]));
  for (const update of updates) {
    const existing = byId.get(update.id);
    if (existing) {
      existing.status = update.status;
      existing.answerSummary = update.answerSummary;
    }
  }
  for (const addition of additions) {
    if (!byId.has(addition.id)) byId.set(addition.id, addition);
  }
  return [...byId.values()];
}
