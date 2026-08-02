import type { SeededRng } from "@/domain/walk/prng";
import { titleExclusionReason } from "@/domain/walk/exclusions";
import {
  RequestBudgetExhaustedError,
  type WalkGateway,
  type WalkProgress,
} from "@/domain/walk/types";
import { findMotif } from "@/domain/motifs/presets";
import type {
  BurkeEndReason,
  BurkeNote,
  BurkeOracle,
  BurkeSeed,
  BurkeVisitedNode,
  BurkeWalkResult,
  ElasticityCheckpoint,
} from "./types";

// The BurkeWalker engine. The walker is not searching for facts — it is
// searching for redescriptions. The stopping condition is not "enough
// pages" but "the seed can now be redescribed in a way impossible before"
// (or explanatory saturation: the story stops changing despite new
// material). maxPages is a safety cap, honestly labeled as such.
//
// Division of labor: this engine owns traversal mechanics (candidate
// pre-filtering, budgets, cadence, stop conditions); the oracle owns every
// act of judgment (salience, choosing, questioning, noting, storytelling).

export interface BurkeEngineConfig {
  seed: BurkeSeed;
  priming: string;
  motif: string;
  elasticityInterval: number;
  maxPages: number;
  branchFactor: number;
  excludeMetaPages: boolean;
  allowRevisits: boolean;
}

/** How many candidates the oracle is shown per step (post-filter sample). */
const ORACLE_CANDIDATE_LIMIT = 10;
/** Summaries are trimmed before prompting to keep steps cheap. */
const SUMMARY_LIMIT = 500;
/** Two stable elasticity checkpoints in a row = saturation. */
const SATURATION_STREAK = 2;

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
  const visited: BurkeVisitedNode[] = [];
  const notes: BurkeNote[] = [];
  const checkpoints: ElasticityCheckpoint[] = [];
  const visitedTitles = new Set<string>();
  let stableStreak = 0;

  const report = async (stage: string, currentTitle: string) => {
    await onProgress?.({
      visitedCount: visited.length,
      targetLength: config.maxPages,
      requestsUsed: wikipedia.requestsUsed(),
      currentTitle,
      stage,
    });
  };

  const finish = async (endReason: BurkeEndReason): Promise<BurkeWalkResult> => {
    const finalRedescription =
      notes.length > 0
        ? await oracle.recode({ seed: config.seed, notes, checkpoints })
        : "";
    return {
      visited,
      notes,
      salience,
      checkpoints,
      finalRedescription,
      endReason,
      requestsUsed: wikipedia.requestsUsed(),
    };
  };

  // Layer 2: curiosity priming → salience weights.
  await report("Priming curiosity", startTitle);
  const salience = await oracle.prime({
    seed: config.seed,
    priming: config.priming,
    motifSensitivity: motif?.sensitivity ?? [],
  });

  try {
    // Visit the start node (the seed's entry point; it gets no note).
    const startInfos = await wikipedia.getArticleInfos([startTitle]);
    const startInfo = startInfos.get(startTitle);
    if (!startInfo || startInfo.missing) {
      throw new Error(`Article not found: "${startTitle}"`);
    }
    let current: BurkeVisitedNode = {
      info: startInfo,
      categories: await wikipedia.getCategories(startInfo.title),
      visitIndex: 0,
      judgments: [],
    };
    visited.push(current);
    visitedTitles.add(startInfo.title);
    await report("Walking", startInfo.title);

    while (visited.length < config.maxPages) {
      // Candidate pool: deterministic pre-filter, seeded sample, then a
      // batched summary fetch for the handful the oracle will actually see.
      const linkTitles = await wikipedia.getOutgoingLinkTitles(current.info.title);
      const viable = [...linkTitles].sort().filter((title) => {
        if (titleExclusionReason(title, config)) return false;
        if (!config.allowRevisits && visitedTitles.has(title)) return false;
        return true;
      });
      if (viable.length === 0) return finish("NO_ELIGIBLE_CANDIDATES");

      const pool = rng.sample(viable, Math.min(config.branchFactor, 20));
      const infos = await wikipedia.getArticleInfos(pool);
      const candidates = pool
        .map((title) => infos.get(title))
        .filter((i): i is NonNullable<typeof i> => !!i && !i.missing && !i.isDisambiguation)
        .slice(0, ORACLE_CANDIDATE_LIMIT)
        .map((i) => ({
          title: i.title,
          summary: i.summary.slice(0, SUMMARY_LIMIT),
        }));
      if (candidates.length === 0) return finish("NO_ELIGIBLE_CANDIDATES");

      await report("Judging candidates", current.info.title);
      const decision = await oracle.step({
        seed: config.seed,
        salience,
        current: {
          title: current.info.title,
          summary: current.info.summary.slice(0, SUMMARY_LIMIT),
        },
        candidates,
        notesSoFar: notes,
        preferredQuestions: motif?.preferredQuestions ?? [],
      });

      // The discard rule is enforced here, not merely suggested: a chosen
      // candidate the oracle itself discarded is a contract violation.
      const eligible = decision.judgments.filter((j) => !j.discarded);
      if (eligible.length === 0) return finish("NO_ELIGIBLE_CANDIDATES");
      const chosenJudgment = eligible.find((j) => j.title === decision.chosenTitle);
      if (!chosenJudgment) {
        throw new Error(
          `Oracle chose "${decision.chosenTitle}" but discarded it or never judged it`,
        );
      }
      const chosenInfo = infos.get(decision.chosenTitle);
      if (!chosenInfo) {
        throw new Error(`Oracle chose "${decision.chosenTitle}", not in candidate pool`);
      }

      const note: BurkeNote = {
        visitIndex: visited.length,
        articleTitle: chosenInfo.title,
        question: decision.question,
        observation: decision.observation,
        changedUnderstanding: decision.changedUnderstanding,
        returnToSeed: decision.returnToSeed,
      };
      notes.push(note);

      current = {
        info: chosenInfo,
        categories: await wikipedia.getCategories(chosenInfo.title),
        visitIndex: visited.length,
        note,
        judgments: decision.judgments,
      };
      visited.push(current);
      visitedTitles.add(chosenInfo.title);
      await report("Walking", chosenInfo.title);

      if (decision.redescriptionAchieved) {
        return finish("REDESCRIPTION_ACHIEVED");
      }

      // Narrative elasticity: every N pages, tell the story of the seed.
      if (notes.length > 0 && notes.length % config.elasticityInterval === 0) {
        await report("Elasticity checkpoint", current.info.title);
        const previous = checkpoints[checkpoints.length - 1]?.story ?? null;
        const result = await oracle.elasticity({
          seed: config.seed,
          notesSoFar: notes,
          previousStory: previous,
        });
        checkpoints.push({ afterPages: visited.length, ...result });

        if (previous !== null && !result.changedSubstantially) {
          stableStreak += 1;
          if (stableStreak >= SATURATION_STREAK - 1) {
            return finish("EXPLANATORY_SATURATION");
          }
        } else {
          stableStreak = 0;
        }
      }
    }

    return finish("PAGE_CAP_REACHED");
  } catch (error) {
    if (error instanceof RequestBudgetExhaustedError) {
      return finish("REQUEST_BUDGET_EXHAUSTED");
    }
    throw error;
  }
}
