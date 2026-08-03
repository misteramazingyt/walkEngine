import { z } from "zod";

// Parsing a natural-language brief into walk configuration. Bounds mirror
// walkConfigurationSchema so a parse can never produce a configuration the
// application would reject on save.

export const DENSITIES = ["sparse", "moderate", "dense"] as const;

export const briefSchema = z.object({
  /** Words asked for, in the brief's own words ("around 1950 words"). */
  targetWords: z.number().int().min(300).max(20000).nullable().default(null),
  /**
   * How much the brief already fixes. A dense brief arrives with its
   * connections made and wants them reduced and enlivened; a sparse one
   * hands over a scent and expects the search to do the work. This governs
   * how far the route may wander and whether the ending is fixed in advance.
   */
  density: z.enum(DENSITIES).default("moderate"),
  /** Relationships the brief already asserts. Empty when it asserts none. */
  namedConnections: z.array(z.string()).default([]),
  /** The viewpoint or claim the piece argues, where one is given. */
  thesis: z.string().default(""),
  seedText: z.string().min(1),
  attentionProgram: z.string().min(1),
  /** Years; negative is BCE. Null means the brief implied no bound. */
  temporalStart: z.number().int().nullable().default(null),
  temporalEnd: z.number().int().nullable().default(null),
  // Up to the walk configuration's own ceiling: a long-scale brief asking
  // for oscillation needs subjects to oscillate between.
  subjectCount: z.number().int().min(2).max(10),
  reading: z.string().min(1),
  unhonoured: z.array(z.string()).default([]),
});

export type BriefModel = z.infer<typeof briefSchema>;
