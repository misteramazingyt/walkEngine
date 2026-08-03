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

export const routeStepSchema = z.object({
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
});

export const routePlanSchema = z.object({
  title: z.string().min(1),
  /** How the seed's proposition is being treated as a historical artefact. */
  thesis: z.string().min(1),
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
