import { z } from "zod";

// A planned route: concrete subjects that traverse the contingencies behind
// a proposition, each verified against the archive afterwards. Planning
// before sampling is the inversion — a crawl produces prose that reads like
// a crawl, because adjacency is the only thing it knows.

export const EDGE_TYPES = [
  "immanent_contradiction",
  "material_bias",
  "condition_of_possibility",
  "recoding",
] as const;

export const BEAT_KINDS = ["open", "advance", "recapitulate", "intervene", "close"] as const;

export const STANCES = ["sedimentation", "contested_victory"] as const;

/**
 * A member of the cast. Subjects are declared once and referred to by id,
 * so one can hold the topic across several beats and be mentioned in beats
 * that are about something else. The previous schema made a step BE a page,
 * which meant a subject could appear exactly once: every draft measured 1.00
 * beats per subject, against Burke's 53% of seams carrying one forward.
 */
export const routeSubjectSchema = z.object({
  id: z.string().min(1),
  pageTitle: z.string().min(1),
  /** One clause a beat can use when mentioning this in passing. */
  gloss: z.string().min(1),
  substrate: z.string().min(1),
  institution: z.string().min(1),
  selfUnderstanding: z.string().min(1),
});

export const routeStepSchema = z.object({
  beatKind: z.enum(BEAT_KINDS).default("advance"),
  /** Which cast member this beat is ABOUT. Several beats may share one. */
  subjectId: z.string().min(1),
  /** What a reader should picture. One concrete scene, not a summary. */
  scene: z.string().min(1),
  edgeType: z.enum(EDGE_TYPES),
  /** How this step arises from the previous one, in its own terms. */
  arisesFrom: z.string().min(1),
  /**
   * The road not taken. A causal chain asserts necessity; a contingent
   * traversal exhibits the fork and declines to naturalize it.
   */
  forkAlternative: z.string().min(1),
  forkWhatWouldDiffer: z.string().min(1),
  /** What this step contributes to the seed's proposition. */
  bearsOnSeed: z.string().min(1),
  /** A specific, checkable particular: a date, a number, a name, a place. */
  particular: z.string().min(1),

  // --- accretion ------------------------------------------------------
  // Burke carries SUBJECTS across a seam (53% of them) and almost never
  // carries determinations: return_to_earlier is 2.3% of his transitions.
  // That is why an episode leaves a viewer with the knowledge of connection
  // and no changed understanding of anything. These fields are the
  // difference, and they are the only part of the design the corpus could
  // not supply, because he is not doing it.

  /** What this step adds to the understanding of the object of inquiry. */
  determination: z.string().min(1),
  /**
   * Indices of earlier steps whose determination this one qualifies,
   * complicates, or overturns. Empty only for the opening steps: a route
   * whose determinations never touch each other is a list, not an argument.
   */
  revises: z.array(z.number().int().min(1)).default([]),
  /** How the object looks different once this determination is added. */
  changesTheObject: z.string().min(1),
  /**
   * The transition into this beat, written as its FIRST clause. Measured
   * over 653 of Burke's seams, the bridge sits at the head of the incoming
   * paragraph 288 times and at the tail of the outgoing one 3 times. A beat
   * ends on its own material; the next beat reaches back, never the reverse.
   * Empty where the beat should simply cut.
   */
  entry: z.string().default(""),
  /** Words this beat should run to, from the piece's total budget. */
  words: z.number().int().min(40).max(600).default(110),

  // --- the story inside the beat --------------------------------------
  // Measured against Burke: his paragraphs run 7.6% `problem` and 7.8%
  // `attempt`; ours ran 2.1% and 1.0%. Nobody in our writing ever wanted
  // anything or had a go at getting it, so nothing inside a beat was a
  // story — a thing existed, someone made it, it had effects. These three
  // fields are chosen at DISCOVERY, so a subject with no one trying
  // anything is not selected in the first place.

  /** Who wanted something here, and what. A person or a definite group. */
  someoneWanted: z.string().min(1),
  /** What they actually did about it. */
  whatTheyTried: z.string().min(1),
  /**
   * What happened instead of, or as well as, what they were after. This is
   * the beat's own turn, and it must differ from its neighbours': our draft
   * turned 86.7% of the time against Burke's 50.8%, and every turn was the
   * same one — meaning shifting from the communal to the individual, fifteen
   * times over. A turn a reader can predict is not a turn.
   */
  whatHappenedInstead: z.string().min(1),
});

export const routePlanSchema = z.object({
  title: z.string().min(1),
  /** How the seed's proposition is being treated as a historical artefact. */
  thesis: z.string().min(1),
  /** The thing whose understanding accumulates. Not the proposition. */
  objectOfInquiry: z.string().min(1),
  /** The existential question the route keeps re-asking. */
  question: z.string().min(1),
  stance: z.enum(STANCES).default("sedimentation"),
  /**
   * What the object looks like before the route, in the terms a reader
   * already has. The closing must not be paraphrasable from this — that is
   * the test of whether anything accreted.
   */
  openingUnderstanding: z.string().min(1),
  /** The same object, in terms only the route makes available. */
  closingUnderstanding: z.string().min(1),
  /**
   * Everyone in the piece. Larger than the number of topic-holders: Burke
   * keeps 11 to 16 subjects live at once and 70% of his mentions are a
   * subject helping explain something else rather than being explained.
   */
  cast: z.array(routeSubjectSchema).min(6).max(40),
  steps: z.array(routeStepSchema).min(4).max(40),
  closing: z.string().min(1),
});

export type RoutePlanModel = z.infer<typeof routePlanSchema>;
export type RouteStepModel = z.infer<typeof routeStepSchema>;

export const beatSchema = z.object({
  prose: z.string().min(1),
  /** Where the fork appears in the paragraph, quoted from it. */
  forkSentence: z.string().default(""),
});
