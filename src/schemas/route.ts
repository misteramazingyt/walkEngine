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

export const routeStepSchema = z.object({
  beatKind: z.enum(BEAT_KINDS).default("advance"),
  /** The Wikipedia article this step is about. Verified before use. */
  pageTitle: z.string().min(1),
  /** What a reader should picture. One concrete scene, not a summary. */
  scene: z.string().min(1),
  /** The configuration: substrate, institution, and shape of self-understanding. */
  substrate: z.string().min(1),
  institution: z.string().min(1),
  selfUnderstanding: z.string().min(1),
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
  steps: z.array(routeStepSchema).min(6).max(30),
  closing: z.string().min(1),
});

export type RoutePlanModel = z.infer<typeof routePlanSchema>;
export type RouteStepModel = z.infer<typeof routeStepSchema>;

export const beatSchema = z.object({
  prose: z.string().min(1),
  /** Where the fork appears in the paragraph, quoted from it. */
  forkSentence: z.string().default(""),
});
