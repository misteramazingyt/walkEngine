import type { BurkeClusterState, Subject } from "@/domain/burkecluster/types";
import { planBraid, type BraidSource } from "./plan";
import {
  BRAID_DEFAULTS,
  type BraidComposition,
  type BraidOracle,
  type BraidPlan,
  type BraidPlanConfig,
  type ComposedBeat,
} from "./types";

// Composition walks the plan and writes each beat, then checks what was
// written against what was planned. The check matters: the plan's whole
// claim is that a subject is mentioned before it is explained, and only the
// prose can say whether that happened. A plan satisfied on paper and
// abandoned in the writing would be worse than no plan, because the
// diagnostics would report a braid that the reader cannot find.

const GLOSS_LIMIT = 220;

/**
 * What can be said about a subject. A cluster-level subject has a narrated
 * account; a page carries its own lead summary in audienceAnchor. Falling
 * back to the bare label would hand the model a name and no material, which
 * is how a beat ends up restating its title at length.
 */
function gloss(state: BurkeClusterState, subject: Subject): string {
  const accepted = state.acceptedClusters.find((c) => c.subject.id === subject.id);
  const account = accepted?.narration?.account;
  if (account) return account.slice(0, GLOSS_LIMIT);
  const anchor = subject.audienceAnchor;
  return (anchor && anchor.trim().length > 0 ? anchor : subject.label).slice(
    0,
    GLOSS_LIMIT,
  );
}

export async function composeBraid(options: {
  source: BraidSource;
  oracle: BraidOracle;
  config?: BraidPlanConfig;
  seedLabel: string;
  onProgress?: (beat: number, total: number) => Promise<void> | void;
}): Promise<{ plan: BraidPlan; composition: BraidComposition }> {
  const config = options.config ?? BRAID_DEFAULTS;
  const plan = planBraid(options.source, config);
  const state = options.source.state;
  const notes: string[] = [];
  const beats: ComposedBeat[] = [];

  if (plan.beats.length === 0) {
    return {
      plan,
      composition: {
        title: options.seedLabel,
        opening: "",
        beats: [],
        closing: "",
        notes: ["No accepted subjects: there is nothing to braid."],
      },
    };
  }

  const introduced = new Set<string>();
  let previousProse = "";

  for (const beat of plan.beats) {
    const topic = plan.live.get(beat.topicSubjectId);
    if (!topic) continue;

    const supporting = beat.supportingSubjectIds
      .concat(beat.recedingSubjectIds)
      .map((id) => {
        const entry = plan.live.get(id);
        if (!entry) return null;
        return {
          id,
          label: entry.subject.label,
          gloss: gloss(state, entry.subject),
          firstMention: !introduced.has(id),
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    const planted = beat.plantedSubjectIds
      .map((id) => {
        const entry = plan.live.get(id);
        if (!entry) return null;
        return {
          id,
          label: entry.subject.label,
          gloss: gloss(state, entry.subject),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const written = await options.oracle.composeBeat({
      beat,
      topic,
      topicAccount: gloss(state, topic.subject),
      supporting,
      planted,
      previousProse,
      seedLabel: options.seedLabel,
      isFirst: beat.index === 1,
      isLast: beat.index === plan.beats.length,
    });

    // Did the writing keep the plan's promise? A planted subject that never
    // reached the prose is a plant that did not happen, and the beat that
    // later pays it off will land on a reader who was never prepared.
    const mentioned = new Set(written.mentioned);
    const unplanted = beat.plantedSubjectIds.filter((id) => !mentioned.has(id));
    if (unplanted.length > 0) {
      const labels = unplanted
        .map((id) => plan.live.get(id)?.subject.label ?? id)
        .join(", ");
      notes.push(`beat ${beat.index}: planned to plant ${labels}, and did not`);
    }
    if (!mentioned.has(beat.topicSubjectId)) {
      notes.push(
        `beat ${beat.index}: never mentions its own topic, ${topic.subject.label}`,
      );
    }

    for (const id of written.mentioned) introduced.add(id);
    beats.push({
      index: beat.index,
      topicLabel: topic.subject.label,
      prose: written.prose,
      mentioned: written.mentioned,
      plantSentence: written.plantSentence,
    });
    previousProse = written.prose;
    await options.onProgress?.(beat.index, plan.beats.length);
  }

  return {
    plan,
    composition: {
      title: options.seedLabel,
      opening: beats[0]?.prose ?? "",
      beats,
      closing: beats[beats.length - 1]?.prose ?? "",
      notes,
    },
  };
}
