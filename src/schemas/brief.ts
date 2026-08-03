import { z } from "zod";

// Parsing a natural-language brief into walk configuration. Bounds mirror
// walkConfigurationSchema so a parse can never produce a configuration the
// application would reject on save.

export const briefSchema = z.object({
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
