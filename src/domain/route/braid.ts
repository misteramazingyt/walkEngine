import type { RoutePlan } from "./types";

// Liveness is arithmetic, so code does it.
//
// The planner declares a cast and which subject each beat is about. It is
// not asked to work out who should still be in play at beat nine such that
// twelve subjects are live at once — that is a counting problem, and models
// do counting problems badly while doing the judgment well.
//
// Measured targets: Burke keeps 11-16 subjects live simultaneously, 53% of
// his seams carry the same subject forward, and 70% of all mentions are a
// subject supporting something else rather than being the topic.

export interface Liveness {
  /** Subject ids live at each beat, in beat order. */
  liveAt: string[][];
  /** Ids this beat should mention without being about them. */
  supportingAt: string[][];
  firstBeat: Map<string, number>;
  lastBeat: Map<string, number>;
  diagnostics: {
    beats: number;
    castSize: number;
    topicHolders: number;
    meanBeatsPerTopicSubject: number;
    medianLiveAtOnce: number;
    carriedSeamsPct: number;
  };
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Deal bridge kinds across the seams in the measured proportions.
 *
 * Asking a model to hit 53% produced 11%, the same way asking it to keep a
 * dozen subjects live produced six: proportions are arithmetic. So the kinds
 * are dealt here and the model is told which one to realise, which is
 * judgment and the thing it is good at.
 */
const BRIDGE_MIX: Array<[string, number]> = [
  ["carried_subject", 0.53],
  ["consequence", 0.21],
  ["problem_raised", 0.084],
  ["hard_cut", 0.043],
  ["contrast", 0.035],
  ["return_to_earlier", 0.023],
  ["instrument_needed", 0.015],
];

/**
 * How many beats each subject earns.
 *
 * Measured over 191 dwell runs in 14 episodes, by why the programme stayed:
 *
 *   produces_next          4.78 paragraphs   the strongest predictor
 *   much_to_tell           4.18
 *   mechanism_needs_steps  3.19
 *   stakes_are_here        2.55
 *   bears_on_destination   1.57              the WEAKEST
 *
 * The last of those is the useful surprise: a subject that matters to where
 * the piece is going gets named and passed, not dwelt upon. Selecting for
 * thesis-relevance and then lingering — which is what our planner did — is
 * the opposite of the practice.
 *
 * So depth is earned by incident and by causal work, and the arithmetic is
 * done here because asking a model for a distribution has twice produced a
 * fifth of what was asked for.
 */
export function allocateBeats(
  plan: RoutePlan,
  totalBeats: number,
): Map<string, number> {
  const weight = new Map<string, number>();
  const incidents = plan.cast.map((c) => c.incidents);
  const spread = Math.max(...incidents) - Math.min(...incidents);
  const anyProduces = plan.cast.some((c) => c.producesSubjectId.trim().length > 0);

  for (const member of plan.cast) {
    const produces = member.producesSubjectId.trim().length > 0;
    const incident = member.incidents >= 3 ? 2 : member.incidents >= 1 ? 1 : 0;
    weight.set(member.id, Math.min(6, 1 + (produces ? 2 : 0) + incident));
  }

  // The planner keeps returning a constant for incidents and, since the
  // consequence gate, sometimes no productions at all. Both leave every
  // weight identical, and identical weights give every subject one beat —
  // which is the flat sequence the cast was introduced to fix. When the
  // declared signal carries no information, fall back to the corpus shape
  // instead: a third of subjects taking two thirds of the paragraphs.
  if (spread === 0 && !anyProduces) {
    plan.cast.forEach((member, index) => {
      weight.set(member.id, index % 3 === 0 ? 4 : 1);
    });
  }

  // The closing sixth accelerates. Measured: dwell runs average 3.80
  // paragraphs through the middle and 2.12 at the end, so subjects arrive
  // roughly twice as fast while the sentences lengthen. Whatever depth the
  // last subjects earned, they do not get to spend it.
  const closingFrom = Math.floor(plan.cast.length * (5 / 6));
  plan.cast.forEach((member, index) => {
    if (index >= closingFrom) {
      weight.set(member.id, Math.max(1, (weight.get(member.id) ?? 1) * 0.56));
    }
  });

  const total = [...weight.values()].reduce((a, b) => a + b, 0) || 1;
  const beats = new Map<string, number>();
  let assigned = 0;
  for (const [id, w] of weight) {
    const n = Math.max(1, Math.round((w / total) * totalBeats));
    beats.set(id, n);
    assigned += n;
  }

  // Trim or extend from the weakest subjects first, so rounding never robs
  // one that earned its depth.
  const ranked = [...weight.entries()].sort((a, b) => a[1] - b[1]);
  let i = 0;
  while (assigned > totalBeats && i < ranked.length * 4) {
    const [id] = ranked[i % ranked.length];
    if ((beats.get(id) ?? 1) > 1) {
      beats.set(id, (beats.get(id) ?? 1) - 1);
      assigned -= 1;
    }
    i += 1;
  }
  const strongest = [...weight.entries()].sort((a, b) => b[1] - a[1]);
  i = 0;
  while (assigned < totalBeats && strongest.length > 0) {
    const [id] = strongest[i % strongest.length];
    beats.set(id, (beats.get(id) ?? 1) + 1);
    assigned += 1;
    i += 1;
  }
  return beats;
}

export interface PerformanceCard {
  /** This beat carries the viewer-facing voice: address or question. */
  voice: "address" | "question" | "none";
  /** One wry aside with no structural duty. */
  aside: boolean;
  /** A rest reports cleanly: no turn, no reversal. 45% of Burke's paragraphs. */
  rest: boolean;
  /** Hard cap; the check pass rejects a beat that blows it. */
  wordCap: number;
}

/**
 * The properties that converged in our output are the ones dealt per unit
 * in code; the ones that stayed divergent were requested as proportions in
 * prompts. Voice, rests and length join the dealt side. Rates are measured:
 * asides 9.1% of moves (~2 beats in 5), questions 0.22/paragraph (~1 in 5),
 * address raised above Burke's 3.1% of moves toward the second presenter's
 * pervasive second person; rests at 45%. Dealt on a fixed cycle so runs are
 * reproducible.
 */
export function dealPerformanceCards(plan: RoutePlan): PerformanceCard[] {
  return plan.steps.map((step, i) => {
    const isOpen = step.beatKind === "open";
    const isClose = step.beatKind === "close" || i === plan.steps.length - 1;
    const voice: PerformanceCard["voice"] =
      isOpen || isClose || i % 3 === 1
        ? "address"
        : i % 5 === 3
          ? "question"
          : "none";
    return {
      voice,
      aside: i % 5 === 2 || i % 5 === 4,
      rest: !isOpen && !isClose && i % 9 in { 0: 1, 4: 1, 6: 1, 8: 1 },
      wordCap: Math.round(step.words * 1.2),
    };
  });
}

export function assignBridgeKinds(plan: RoutePlan): void {
  const seams = plan.steps.length - 1;
  if (seams < 1) return;

  const quota = new Map<string, number>();
  for (const [kind, share] of BRIDGE_MIX) {
    quota.set(kind, Math.round(share * seams));
  }

  for (let i = 1; i < plan.steps.length; i++) {
    const sameSubject = plan.steps[i].subjectId === plan.steps[i - 1].subjectId;
    // A seam that keeps the same subject IS a carried subject; nothing else
    // can be true of it, whatever the quota says.
    if (sameSubject) {
      plan.steps[i].bridgeKind = "carried_subject";
      quota.set("carried_subject", (quota.get("carried_subject") ?? 0) - 1);
      continue;
    }
    // Otherwise spend the remaining quota, commonest first, skipping
    // carried_subject since the topic demonstrably changed.
    // In the closing sixth the mix shifts: consequence rises from 19.5% to
    // 28.6% and return_to_earlier from 1.8% to 4.8%, which is where the
    // sense of having gained something comes from — the end reaches back.
    const closing = i >= plan.steps.length * (5 / 6);
    const preference = closing
      ? ["return_to_earlier", "consequence", "hard_cut", "contrast"]
      : BRIDGE_MIX.filter(([k]) => k !== "carried_subject").map(([k]) => k);
    // A consequence seam requires an actual production. The planner says
    // which subject each cast member brings about; where it says nothing,
    // dealing `consequence` asks the writer to realise a link that is not
    // there, and it comes back as "parallel to" or "alongside".
    const prevId = plan.steps[i - 1].subjectId;
    const prev = plan.cast.find((c) => c.id === prevId);
    const produces = prev?.producesSubjectId === plan.steps[i].subjectId;
    const allowed = produces
      ? preference
      : preference.filter((k) => k !== "consequence");
    const pick =
      allowed.find((k) => (quota.get(k) ?? 0) > 0) ??
      (produces ? "consequence" : "hard_cut");
    plan.steps[i].bridgeKind = pick as RoutePlan["steps"][number]["bridgeKind"];
    quota.set(pick, (quota.get(pick) ?? 0) - 1);
  }
  plan.steps[0].bridgeKind = "hard_cut";
}

export function computeLiveness(
  plan: RoutePlan,
  options: { liveTarget?: number; supportingPerBeat?: number } = {},
): Liveness {
  const liveTarget = options.liveTarget ?? 12;
  const beats = plan.steps.length;
  const cast = plan.cast.map((c) => c.id);

  // A subject enters shortly before it first holds the topic and stays live
  // well after it last holds it: that tail is what lets a later beat reopen
  // it, and its absence is why our drafts scored 1.00 beats per subject.
  const topicBeats = new Map<string, number[]>();
  plan.steps.forEach((step, i) => {
    const list = topicBeats.get(step.subjectId) ?? [];
    list.push(i);
    topicBeats.set(step.subjectId, list);
  });

  // Spread cast members that never hold the topic evenly, so the live set is
  // populated from the start rather than filling up only as topics accrue.
  const spanLength = Math.max(3, Math.round((beats * liveTarget) / Math.max(1, cast.length)));
  const firstBeat = new Map<string, number>();
  const lastBeat = new Map<string, number>();

  cast.forEach((id, index) => {
    const held = topicBeats.get(id);
    if (held && held.length > 0) {
      const lead = Math.min(2, held[0]);
      firstBeat.set(id, Math.max(0, held[0] - lead));
      lastBeat.set(id, Math.min(beats - 1, held[held.length - 1] + spanLength));
    } else {
      const start = Math.floor((index / Math.max(1, cast.length)) * beats);
      firstBeat.set(id, start);
      lastBeat.set(id, Math.min(beats - 1, start + spanLength));
    }
  });

  const liveAt: string[][] = [];
  const supportingAt: string[][] = [];
  for (let i = 0; i < beats; i++) {
    const live = cast.filter(
      (id) => (firstBeat.get(id) ?? 0) <= i && (lastBeat.get(id) ?? 0) >= i,
    );
    liveAt.push(live);
    const topic = plan.steps[i].subjectId;
    supportingAt.push(
      live
        .filter((id) => id !== topic)
        .slice(0, options.supportingPerBeat ?? 6),
    );
  }

  const holders = [...topicBeats.keys()];
  let carried = 0;
  for (let i = 1; i < beats; i++) {
    if (plan.steps[i].subjectId === plan.steps[i - 1].subjectId) carried += 1;
  }

  return {
    liveAt,
    supportingAt,
    firstBeat,
    lastBeat,
    diagnostics: {
      beats,
      castSize: cast.length,
      topicHolders: holders.length,
      meanBeatsPerTopicSubject:
        Math.round((beats / Math.max(1, holders.length)) * 100) / 100,
      medianLiveAtOnce: median(liveAt.map((l) => l.length)),
      carriedSeamsPct:
        Math.round((100 * carried) / Math.max(1, beats - 1) * 10) / 10,
    },
  };
}
