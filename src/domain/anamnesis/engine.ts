import type { SeededRng } from "@/domain/walk/prng";
import { titleExclusionReason } from "@/domain/walk/exclusions";
import {
  RequestBudgetExhaustedError,
  type ArticleInfo,
  type WalkGateway,
} from "@/domain/walk/types";
import type { StrategyProgress } from "@/domain/walk/strategy";
import { WEAK_EVIDENCE_STATUSES } from "@/domain/explanation/types";
import { paymentStrength, scoreMediation } from "./scoring";
import type {
  AnamnesisEndReason,
  AnamnesisOracle,
  AnamnesisState,
  AnamnesisVisitedNode,
  AnamnesisWalkResult,
  CandidateMediationAssessment,
  Debt,
  Mediation,
  RecollectionTest,
  TerminalSentence,
} from "./types";

// The anamnetic engine.
//
// Control flow per step, in this order and no other:
//   1. SELECT DEBT — which unpaid obligation of the terminal sentence most
//      needs settling? Phrase the archival question that would settle it.
//      No candidates exist yet.
//   2. GENERATE   — collect possibilities (outlinks + search over the debt's
//      phrases). Generation seeks breadth.
//   3. ASSESS     — judge by what each candidate would PAY, never by what it
//      resembles. Engine computes the weighted totals.
//   4. GATE       — a candidate becomes a mediation only if it actually pays,
//      supplies a concrete anchor, and earns rather than restates.
//   5. INTEGRATE  — record the payment, re-gloss the sentence, and open the
//      new debts that the residue and the discovery have created.
//   6. RECOLLECT  — periodically re-read the sentence. Does it land yet?
//
// The walk ends when the sentence is inhabitable, not when pages run out.

export interface AnamnesisEngineConfig {
  terminal: TerminalSentence;
  audienceNote: string;
  /** Re-read the sentence every N accepted mediations. */
  recollectionInterval: number;
  /** Safety cap — the real stopping condition is inhabitability. */
  maxMediations: number;
  branchFactor: number;
  excludeMetaPages: boolean;
  allowRevisits: boolean;
  requireMotivatedTransitions: boolean;
  /** 0 = austere; 1 = permit more affective material (never unpenalized). */
  sentimentalityTolerance: number;
  /** Require every mediation to supply a concrete anchor. */
  requireConcreteAnchors: boolean;
}

const SUMMARY_LIMIT = 600;
const ORACLE_CANDIDATE_LIMIT = 12;
const GATE_ATTEMPTS_PER_STEP = 3;
const LOW_PAYMENT_THRESHOLD = 0.35;
const LOW_PAYMENT_STREAK_LIMIT = 2;
const HIGH_PRIORITY_DEBT = 0.6;
const INHABITABLE_SCORE = 0.75;

export async function runAnamnesisWalk(options: {
  wikipedia: WalkGateway;
  oracle: AnamnesisOracle;
  rng: SeededRng;
  config: AnamnesisEngineConfig;
  startTitle: string;
  onProgress?: (progress: StrategyProgress) => void | Promise<void>;
}): Promise<AnamnesisWalkResult> {
  const { wikipedia, oracle, rng, config, startTitle, onProgress } = options;

  const visited: AnamnesisVisitedNode[] = [];
  const mediations: Mediation[] = [];
  const recollectionTests: RecollectionTest[] = [];
  const visitedTitles = new Set<string>();
  const abandonedRoutes: Array<{ title: string; reason: string }> = [];
  const deadEnds = new Set<string>();
  let lowPaymentStreak = 0;

  const report = async (stage: string, currentTitle: string) => {
    await onProgress?.({
      stage,
      currentTitle,
      completed: mediations.length,
      target: config.maxMediations,
      requestsUsed: wikipedia.requestsUsed(),
    });
  };

  await report("Decomposing the terminal sentence", config.terminal.text);
  const decomposition = await oracle.decompose({
    terminal: config.terminal,
    audienceNote: config.audienceNote,
  });

  let state: AnamnesisState = {
    terminal: config.terminal,
    charges: decomposition.charges,
    debts: decomposition.debts,
    currentGloss: decomposition.initialGloss,
    glossVersions: [
      {
        step: 0,
        gloss: decomposition.initialGloss,
        changedBy: "decomposition",
        whatChanged: "initial reading of the sentence, before any mediation",
      },
    ],
    anchors: [],
    abandonedRoutes: [],
  };

  const finish = async (
    endReason: AnamnesisEndReason,
  ): Promise<AnamnesisWalkResult> => {
    const composition =
      mediations.length > 0
        ? await oracle.compose({ state, mediations, recollectionTests })
        : null;
    return {
      visited,
      mediations,
      state: { ...state, abandonedRoutes },
      recollectionTests,
      composition,
      abandonedRoutes,
      endReason,
      requestsUsed: wikipedia.requestsUsed(),
    };
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
    await report("Walking", startInfo.title);

    while (mediations.length < config.maxMediations) {
      const current = visited[visited.length - 1];

      const unpaid = state.debts.filter(
        (d) => d.status === "unpaid" || d.status === "partially_paid",
      );
      if (unpaid.length === 0) return finish("DEBTS_SETTLED");

      // 1. SELECT DEBT — the question precedes the candidates.
      await report("Selecting the debt to pay", current.info.title);
      const selection = await oracle.selectDebt({
        state,
        mediations,
        currentTitle: current.info.title,
      });
      const debt =
        state.debts.find((d) => d.id === selection.debtId) ?? unpaid[0];

      // 2. GENERATE — outlinks plus the debt's own search phrases.
      await report("Searching for a mediation", current.info.title);
      const linkTitles = await wikipedia.getOutgoingLinkTitles(current.info.title);
      const linkPool = rng.sample(
        [...linkTitles].sort().filter(isViable),
        Math.min(config.branchFactor, 18),
      );

      const searchHits: string[] = [];
      if (wikipedia.searchTitles) {
        for (const phrase of selection.searchPhrases.slice(0, 3)) {
          const found = await wikipedia.searchTitles(phrase, 5);
          for (const title of found) {
            if (isViable(title) && !searchHits.includes(title)) {
              searchHits.push(title);
            }
          }
        }
      }

      const poolTitles = [...new Set([...searchHits, ...linkPool])];
      if (poolTitles.length === 0) {
        return finish("NO_CANDIDATE_PAYS");
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
      if (candidates.length === 0) return finish("NO_CANDIDATE_PAYS");

      // 3. ASSESS — by payment, not resemblance.
      await report("Weighing what each would pay", current.info.title);
      const raw = await oracle.assess({
        state,
        debt,
        searchQuestion: selection.searchQuestion,
        currentTitle: current.info.title,
        candidates,
      });

      const assessments: CandidateMediationAssessment[] = raw
        .filter((a) => candidates.some((c) => c.title === a.title))
        .map((a) => ({
          ...a,
          total: scoreMediation(a.scores, {
            sentimentalityTolerance: config.sentimentalityTolerance,
          }),
        }))
        .sort((a, b) => b.total - a.total);

      if (assessments.length === 0) return finish("NO_CANDIDATE_PAYS");

      // 4. GATE — try the strongest in order until one genuinely pays.
      const stepRejections: Array<{ title: string; reason: string }> = [];
      let accepted:
        | {
            assessment: CandidateMediationAssessment;
            info: ArticleInfo;
            result: Awaited<ReturnType<AnamnesisOracle["gate"]>>;
          }
        | null = null;

      for (const assessment of assessments.slice(0, GATE_ATTEMPTS_PER_STEP)) {
        if (deadEnds.has(assessment.title)) {
          stepRejections.push({
            title: assessment.title,
            reason: "already tried and abandoned",
          });
          continue;
        }
        const info = infos.get(assessment.title);
        const candidate = candidates.find((c) => c.title === assessment.title);
        if (!info || !candidate) continue;

        await report(`Testing ${assessment.title}`, current.info.title);
        const result = await oracle.gate({
          state,
          debt,
          searchQuestion: selection.searchQuestion,
          previousTitle: current.info.title,
          candidate,
          assessment,
          requireBridge: config.requireMotivatedTransitions,
        });

        const reject = (reason: string) => {
          stepRejections.push({ title: assessment.title, reason });
          abandonedRoutes.push({ title: assessment.title, reason });
          deadEnds.add(assessment.title);
        };

        if (
          result.gate.verdict !== "accept" ||
          !result.gate.paysDebt ||
          result.gate.paymentCompleteness === "none"
        ) {
          reject(result.gate.rejectionReason ?? "pays nothing the sentence owes");
          continue;
        }

        // Restating the sentence at greater length is not payment.
        if (!result.gate.earnsRatherThanRestates) {
          reject("restates the sentence instead of earning it");
          continue;
        }

        if (
          config.requireConcreteAnchors &&
          (!result.gate.suppliesConcreteAnchor || !result.gate.anchor)
        ) {
          reject("supplies no concrete anchor the reader can hold");
          continue;
        }

        // A felt ending must not be paid for with resemblance alone.
        if (
          WEAK_EVIDENCE_STATUSES.includes(result.gate.evidenceStatus) &&
          result.gate.paymentCompleteness === "full"
        ) {
          reject(
            `claims to fully settle a debt on ${result.gate.evidenceStatus} alone`,
          );
          continue;
        }

        if (config.requireMotivatedTransitions) {
          if (!result.bridge || !result.bridge.standsAlone) {
            reject("no motivated transition could be written");
            continue;
          }
        }

        accepted = { assessment, info, result };
        break;
      }

      if (!accepted) {
        current.rejections.push(...stepRejections);
        return finish("NO_CANDIDATE_PAYS");
      }

      // 5. INTEGRATE — pay the debt, re-gloss, open what the residue owes.
      await report("Recording the payment", accepted.info.title);
      const integration = await oracle.integrate({
        state,
        debt,
        acceptedTitle: accepted.info.title,
        gate: accepted.result.gate,
        step: mediations.length + 1,
      });

      const mediation: Mediation = {
        ...integration.mediation,
        step: mediations.length + 1,
        searchQuestion: selection.searchQuestion,
        bridge: accepted.result.bridge
          ? {
              ...accepted.result.bridge,
              fromTitle: current.info.title,
              toTitle: accepted.info.title,
            }
          : null,
      };
      mediations.push(mediation);

      state = {
        ...state,
        debts: applyDebtUpdates(
          state.debts,
          debt.id,
          integration.debtStatus,
          accepted.info.title,
          accepted.result.gate.residue,
          integration.newDebts,
        ),
        currentGloss: integration.gloss.gloss,
        glossVersions: [...state.glossVersions, integration.gloss],
        anchors: accepted.result.gate.anchor
          ? [...state.anchors, accepted.result.gate.anchor]
          : state.anchors,
      };

      visited.push({
        info: accepted.info,
        categories: await wikipedia.getCategories(accepted.info.title),
        visitIndex: visited.length,
        mediation,
        assessments,
        rejections: stepRejections,
      });
      visitedTitles.add(accepted.info.title);
      await report("Walking", accepted.info.title);

      // Two thin payments in a row means the archive has stopped giving.
      const strength = paymentStrength(accepted.assessment.scores);
      if (strength < LOW_PAYMENT_THRESHOLD) {
        lowPaymentStreak += 1;
        if (lowPaymentStreak >= LOW_PAYMENT_STREAK_LIMIT) {
          return finish("DIMINISHING_PAYMENT");
        }
      } else {
        lowPaymentStreak = 0;
      }

      // 6. RECOLLECT — does the sentence land yet?
      if (mediations.length % config.recollectionInterval === 0) {
        await report("Re-reading the terminal sentence", accepted.info.title);
        const test = await oracle.recollect({ state, mediations });
        recollectionTests.push({
          ...test,
          afterMediations: mediations.length,
        });

        const highPriorityUnpaid = state.debts.filter(
          (d) =>
            (d.status === "unpaid" || d.status === "partially_paid") &&
            d.priority >= HIGH_PRIORITY_DEBT,
        );
        if (
          test.inhabitable &&
          test.inhabitabilityScore >= INHABITABLE_SCORE &&
          highPriorityUnpaid.length === 0 &&
          mediations.length >= 3
        ) {
          return finish("SENTENCE_INHABITABLE");
        }
      }
    }

    return finish("MEDIATION_CAP_REACHED");
  } catch (error) {
    if (error instanceof RequestBudgetExhaustedError) {
      return finish("REQUEST_BUDGET_EXHAUSTED");
    }
    throw error;
  }

  function isViable(title: string): boolean {
    if (titleExclusionReason(title, config)) return false;
    if (!config.allowRevisits && visitedTitles.has(title)) return false;
    if (deadEnds.has(title)) return false;
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

function applyDebtUpdates(
  debts: Debt[],
  paidId: string,
  status: Debt["status"],
  paidBy: string,
  residue: string | null,
  newDebts: Debt[],
): Debt[] {
  const byId = new Map(debts.map((d) => [d.id, { ...d }]));
  const target = byId.get(paidId);
  if (target) {
    target.status = status;
    target.paidBy = [...target.paidBy, paidBy];
    target.residue = residue;
  }
  for (const debt of newDebts) {
    if (!byId.has(debt.id)) byId.set(debt.id, debt);
  }
  return [...byId.values()];
}
