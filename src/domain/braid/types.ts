import type { Subject } from "@/domain/burkecluster/types";

// A braid is what Connections does and a chain does not: a dozen subjects
// stay live while the topic moves among them. Measured over series 1, a
// subject holds the topic for a median of two paragraphs while 11–16
// recurring subjects are simultaneously in play, and 70% of all mentions
// are supporting rather than topical.
//
// The structural consequence is the point. BurkeCluster asserts that a new
// subject was already latent in the previous narration and tests that claim
// by string length. Here a subject can only become topical after it has
// entered the live set, so latency is an invariant of the plan rather than
// a sentence the model wrote.

/** What a subject is doing at a given beat. */
export type SubjectStanding =
  | "planted"     // mentioned here; will carry the topic later
  | "topical"     // the beat is about it
  | "supporting"  // used to explain something else
  | "receding"    // still referred to after its topic run
  | "closed";     // done; no longer mentioned

export interface LiveSubject {
  subject: Subject;
  /** Beat at which it first appears. Always before its first topical beat. */
  enteredAtBeat: number;
  topicBeats: number[];
  lastBeat: number;
  /**
   * Runners-up are discovered but never narrated, so they can be mentioned
   * and never made topical. Keeping the distinction stops the composition
   * from claiming an account it does not have.
   */
  narrated: boolean;
}

export interface Beat {
  index: number;
  topicSubjectId: string;
  supportingSubjectIds: string[];
  /** Introduced here, topical later — the plant that makes latency real. */
  plantedSubjectIds: string[];
  recedingSubjectIds: string[];
  /** How many beats this subject has already held the topic, including this. */
  topicRun: number;
}

export interface BraidPlan {
  beats: Beat[];
  live: Map<string, LiveSubject>;
  /** Presentation order of topical subjects, ordinary scene first. */
  topicOrder: string[];
  /** Which cluster-level arc each page-topic belongs to. */
  arcs: Map<string, string>;
  /** Diagnostics, so a thin or lopsided braid is visible rather than implied. */
  diagnostics: {
    beatCount: number;
    narratedSubjects: number;
    supportingOnlySubjects: number;
    medianLiveAtOnce: number;
    maxLiveAtOnce: number;
    medianTopicRun: number;
    plantsBeforeTopic: number;
    topicsWithoutPlant: number;
  };
}

/** Measured defaults; three episodes is enough for these and no finer. */
export interface BraidPlanConfig {
  /** Median topic residence in Connections series 1. */
  topicBeats: number;
  /** Median simultaneously-live recurring subjects. */
  liveTarget: number;
  /** Beats a subject must be live before it may carry the topic. */
  plantLead: number;
  /** Beats a subject keeps being referred to after its topic run. */
  tailBeats: number;
}

// Connections series 1 moves the topic 29-43 times per episode across
// 32-34 distinct subjects, which is roughly one topic per paragraph with
// some held for two. A topic residence of two beats over three subjects,
// as the first version had, is not a slower version of that shape; it is a
// different one.
export const BRAID_DEFAULTS: BraidPlanConfig = {
  topicBeats: 1,
  liveTarget: 12,
  plantLead: 1,
  tailBeats: 4,
};

export interface ComposedBeat {
  index: number;
  topicLabel: string;
  prose: string;
  /** Subjects the prose actually mentions, by id — checked against the plan. */
  mentioned: string[];
  plantSentence: string;
}

export interface BraidComposition {
  title: string;
  opening: string;
  beats: ComposedBeat[];
  closing: string;
  /** Where the composition departed from the plan, and why. */
  notes: string[];
}

export interface BraidOracle {
  composeBeat(input: {
    beat: Beat;
    topic: LiveSubject;
    topicAccount: string;
    supporting: Array<{ id: string; label: string; gloss: string; firstMention: boolean }>;
    planted: Array<{ id: string; label: string; gloss: string }>;
    previousProse: string;
    seedLabel: string;
    isFirst: boolean;
    isLast: boolean;
  }): Promise<{ prose: string; plantSentence: string; mentioned: string[] }>;
}
