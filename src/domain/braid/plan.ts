import type { BurkeClusterState, Subject } from "@/domain/burkecluster/types";
import { titleExclusionReason } from "@/domain/walk/exclusions";
import {
  BRAID_DEFAULTS,
  type Beat,
  type BraidPlan,
  type BraidPlanConfig,
  type LiveSubject,
} from "./types";

// Turning a discovery chain into a braid.
//
// The unit here is a PAGE, not a cluster. Measured across Connections series
// 1, an episode moves the topic 29 to 43 times over 32 to 34 distinct
// subjects. BurkeCluster accepts three or four cluster-level subjects, an
// order of magnitude short, and the subjects it does accept are synthesized
// abstractions — "Constructing Meaning Through Collective Struggle in Film"
// — where Burke's are things: a plough, a regiment, a river, a man.
//
// The pages inside each accepted cluster are already concrete and already
// stored with their summaries: the 54th Massachusetts, the Union army,
// Abraham Lincoln, Glory. Promoting them to topics gives both the quantity
// and the concreteness at once, from material the walk already paid for.
// The cluster's own label survives as the ARC a run of pages belongs to.
//
// An earlier version of this file built the supporting cast from clusters
// the interpreter had rejected. That was wrong: in a real run 26 of 28
// interpretations returned no subject, correctly refusing navigation
// templates and incoherent mixtures. Rejects are junk, not a cast.

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** A page promoted to a subject, tagged with the arc it belongs to. */
export interface PageSubject {
  subject: Subject;
  arc: string;
  arcIndex: number;
}

export interface BraidSource {
  state: BurkeClusterState;
  /** Sampled articles with their summaries, keyed by title. */
  pages: Map<string, { title: string; summary: string; url?: string }>;
  /**
   * Page-subject ids allowed to carry a beat, once judged against the seed.
   * Absent means no judgment has been applied and every sampled page is
   * eligible — which is adjacency deciding the narrative, and produced
   * sixty-eight beats of encyclopedia index.
   */
  allow?: Set<string>;
}

/**
 * The pages of each accepted cluster, in presentation order, as subjects.
 *
 * Constitutive pages come first — they are what warranted the cluster's
 * subject — then the packet's representatives, which are the same region
 * seen more widely. A page without a stored summary is skipped: it could be
 * named but not used, and a topic nothing can be said about is not a topic.
 */
function pageSubjects(source: BraidSource): PageSubject[] {
  const ordered = [...source.state.acceptedClusters]
    .sort((a, b) => a.discoveryIndex - b.discoveryIndex)
    .reverse();

  const seen = new Set<string>();
  const out: PageSubject[] = [];

  ordered.forEach((cluster, arcIndex) => {
    // Ordered by personalized PageRank relative to the region's origin, so
    // the pages nearest the walk's own concern lead. Taking the packet's
    // representative list in storage order instead put whatever the sampler
    // happened to reach first at the front, which is how a route through a
    // regiment's context can read as a march away from the seed.
    const ranked = [...(cluster.packet?.topByRelevance ?? [])]
      .sort((a, b) => b.ppr - a.ppr)
      .map((p) => p.title);
    const titles = [
      ...(cluster.subject.constitutivePages ?? []),
      ...ranked,
      ...(cluster.packet?.representativeTitles ?? []),
    ];
    for (const title of titles) {
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      // A page can be sampled legitimately and still be no kind of subject.
      // The walk's own exclusion rules are the right judge of that, and
      // applying them here keeps catalogues and namespace pages out of a
      // composition even when an older run stored them.
      if (titleExclusionReason(title, { excludeMetaPages: true })) continue;
      const fromPacket = cluster.packet?.topByRelevance?.find(
        (p) => p.title === title,
      );
      const page =
        source.pages.get(title) ??
        (fromPacket
          ? { title, summary: fromPacket.summary }
          : undefined);
      if (!page || page.summary.trim().length < 40) continue;
      if (source.allow && !source.allow.has(`page:${title}`)) continue;
      seen.add(key);
      out.push({
        arc: cluster.subject.label,
        arcIndex,
        subject: {
          id: `page:${title}`,
          label: title,
          type: "artifact",
          synthesized: false,
          centralPageTitle: title,
          constitutivePages: [title],
          audienceAnchor: page.summary.slice(0, 400),
        } as Subject,
      });
    }
  });

  return out;
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
  source: BraidSource,
  config: BraidPlanConfig = BRAID_DEFAULTS,
): BraidPlan {
  const { state } = source;
  const pages = pageSubjects(source);

  // Pages carry the topic. The seed closes, since the route culminates in it.
  const seedSubject = state.currentSubject;
  const topicSubjects: Subject[] = pages.map((p) => p.subject);
  if (seedSubject && !topicSubjects.some((s) => s.id === seedSubject.id)) {
    topicSubjects.push(seedSubject);
  }

  const arcOf = new Map(pages.map((p) => [p.subject.id, p.arc]));
  // Pages still to come are the supporting cast for the beats before them:
  // the region the walk is moving through, available to be named in passing.
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

      // Fill the live set toward the measured target by drawing forward from
      // the pages still to come. A page named here and made topical later is
      // planted by construction, which is what keeps the set populated
      // without inventing anything the walk did not sample.
      const openSlots = config.liveTarget - countLive(live, beatIndex, config);
      for (let i = 0; i < openSlots; i++) {
        while (
          poolCursor < topicSubjects.length &&
          live.has(topicSubjects[poolCursor].id)
        ) {
          poolCursor += 1;
        }
        if (poolCursor >= topicSubjects.length) break;
        const filler = topicSubjects[poolCursor++];
        ensureLive(filler, beatIndex, true);
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

  return {
    beats,
    live,
    topicOrder: topicSubjects.map((s) => s.id),
    arcs: arcOf,
    diagnostics: diagnose(beats, live),
  };
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
