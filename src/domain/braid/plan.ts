import type {
  BurkeClusterState,
  InterpretedCluster,
  Subject,
} from "@/domain/burkecluster/types";
import {
  BRAID_DEFAULTS,
  type Beat,
  type BraidPlan,
  type BraidPlanConfig,
  type LiveSubject,
} from "./types";

// Turning a discovery chain into a braid.
//
// BurkeCluster interprets several clusters as candidate subjects each cycle,
// accepts the first that passes its gates, and discards the rest — they are
// recorded for audit and never narrated. Those discards are exactly what a
// braid needs: subjects discovered BEFORE the beat where they would matter,
// available to be mentioned in passing while something else is explained.
//
// So no new sampling happens here. The pool is already paid for.

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Runners-up, best first, excluding anything that became an accepted
 * subject. A cluster interpreted into no coherent subject is not a subject.
 */
function runnersUp(state: BurkeClusterState): Subject[] {
  const acceptedIds = new Set(state.acceptedClusters.map((c) => c.subject.id));
  const acceptedLabels = new Set(
    state.acceptedClusters.map((c) => c.subject.label.toLowerCase()),
  );
  const seen = new Set<string>();
  const pool: Array<{ subject: Subject; score: number }> = [];

  for (const cycle of state.cycles) {
    for (const entry of cycle.interpreted as InterpretedCluster[]) {
      const subject = entry.subject;
      if (!subject) continue;
      if (acceptedIds.has(subject.id)) continue;
      if (acceptedLabels.has(subject.label.toLowerCase())) continue;
      if (seen.has(subject.id)) continue;
      seen.add(subject.id);
      pool.push({ subject, score: entry.total ?? 0 });
    }
  }
  return pool.sort((a, b) => b.score - a.score).map((p) => p.subject);
}

/**
 * Build the beat sequence.
 *
 * Presentation follows BurkeCluster's own ordering: reverse discovery, so
 * the composition opens on the last thing found — the ordinary scene — and
 * culminates in the seed. Each narrated subject holds the topic for
 * `topicBeats`, and may only do so after `plantLead` beats of being live,
 * which is what makes the plant real rather than asserted.
 */
export function planBraid(
  state: BurkeClusterState,
  config: BraidPlanConfig = BRAID_DEFAULTS,
): BraidPlan {
  const narratedOrder = [...state.acceptedClusters]
    .sort((a, b) => a.discoveryIndex - b.discoveryIndex)
    .reverse()
    .map((c) => c.subject);

  // The seed is the destination, so it carries the final topic run.
  const seedSubject = state.currentSubject;
  const topicSubjects: Subject[] = [...narratedOrder];
  const seedAccepted = topicSubjects.some((s) => s.id === seedSubject?.id);
  if (seedSubject && !seedAccepted) topicSubjects.push(seedSubject);

  const pool = runnersUp(state);
  const live = new Map<string, LiveSubject>();
  const beats: Beat[] = [];

  const ensureLive = (subject: Subject, beat: number, narrated: boolean) => {
    const existing = live.get(subject.id);
    if (existing) {
      existing.lastBeat = Math.max(existing.lastBeat, beat);
      return existing;
    }
    const entry: LiveSubject = {
      subject,
      enteredAtBeat: beat,
      topicBeats: [],
      lastBeat: beat,
      narrated,
    };
    live.set(subject.id, entry);
    return entry;
  };

  let beatIndex = 0;
  let poolCursor = 0;

  for (let t = 0; t < topicSubjects.length; t++) {
    const subject = topicSubjects[t];
    const nextSubject = topicSubjects[t + 1];

    for (let run = 1; run <= config.topicBeats; run++) {
      beatIndex += 1;

      // The topic must already be live. For the first subject there is no
      // earlier beat to have planted it in, so it enters here; every
      // subsequent topic was planted while its predecessor held the floor.
      const topicEntry = ensureLive(subject, beatIndex, true);
      topicEntry.topicBeats.push(beatIndex);
      topicEntry.lastBeat = beatIndex;

      const planted: string[] = [];
      // Plant the NEXT topic `plantLead` beats before it takes over, so the
      // reader meets it in passing before it is explained.
      if (
        nextSubject &&
        run > config.topicBeats - config.plantLead &&
        !live.has(nextSubject.id)
      ) {
        ensureLive(nextSubject, beatIndex, true);
        planted.push(nextSubject.id);
      }

      // Fill the live set toward the measured target with runners-up. They
      // can be mentioned but never made topical: nothing narrated them.
      const openSlots = config.liveTarget - countLive(live, beatIndex, config);
      for (let i = 0; i < openSlots && poolCursor < pool.length; i++) {
        const filler = pool[poolCursor++];
        ensureLive(filler, beatIndex, false);
        planted.push(filler.id);
      }

      const supporting: string[] = [];
      const receding: string[] = [];
      for (const [id, entry] of live) {
        if (id === subject.id) continue;
        if (planted.includes(id)) continue;
        const hadTopic = entry.topicBeats.length > 0;
        const beatsSinceTopic = hadTopic
          ? beatIndex - entry.topicBeats[entry.topicBeats.length - 1]
          : 0;
        if (hadTopic && beatsSinceTopic > config.tailBeats) continue; // closed
        if (hadTopic) {
          receding.push(id);
          entry.lastBeat = beatIndex;
        } else {
          supporting.push(id);
          entry.lastBeat = beatIndex;
        }
      }

      beats.push({
        index: beatIndex,
        topicSubjectId: subject.id,
        supportingSubjectIds: supporting,
        plantedSubjectIds: planted,
        recedingSubjectIds: receding,
        topicRun: run,
      });
    }
  }

  return { beats, live, topicOrder: topicSubjects.map((s) => s.id), diagnostics: diagnose(beats, live) };
}

function countLive(
  live: Map<string, LiveSubject>,
  beat: number,
  config: BraidPlanConfig,
): number {
  let n = 0;
  for (const entry of live.values()) {
    const last = entry.topicBeats[entry.topicBeats.length - 1];
    const closed = last !== undefined && beat - last > config.tailBeats;
    if (!closed) n += 1;
  }
  return n;
}

function diagnose(
  beats: Beat[],
  live: Map<string, LiveSubject>,
): BraidPlan["diagnostics"] {
  const liveCounts = beats.map(
    (b) =>
      1 + b.supportingSubjectIds.length + b.recedingSubjectIds.length +
      b.plantedSubjectIds.length,
  );
  const runs = new Map<string, number>();
  for (const b of beats) runs.set(b.topicSubjectId, (runs.get(b.topicSubjectId) ?? 0) + 1);

  let plantsBeforeTopic = 0;
  let topicsWithoutPlant = 0;
  for (const entry of live.values()) {
    if (entry.topicBeats.length === 0) continue;
    if (entry.enteredAtBeat < entry.topicBeats[0]) plantsBeforeTopic += 1;
    else topicsWithoutPlant += 1;
  }

  let narrated = 0;
  let supportingOnly = 0;
  for (const entry of live.values()) {
    if (entry.narrated) narrated += 1;
    else supportingOnly += 1;
  }

  return {
    beatCount: beats.length,
    narratedSubjects: narrated,
    supportingOnlySubjects: supportingOnly,
    medianLiveAtOnce: medianOf(liveCounts),
    maxLiveAtOnce: liveCounts.length ? Math.max(...liveCounts) : 0,
    medianTopicRun: medianOf([...runs.values()]),
    plantsBeforeTopic,
    topicsWithoutPlant,
  };
}
