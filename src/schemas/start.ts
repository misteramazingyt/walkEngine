import { z } from "zod";

// Structured output for an LLM-determined start. The title is checked
// against the candidate list by the caller — the schema can only require
// that a title was named, not that the page exists.

export const startSelectionSchema = z.object({
  /** Must be copied verbatim from the candidate list. */
  title: z.string().min(1),
  /** Why this page is where the walk should begin, given the seed. */
  reason: z.string().min(1),
  runnerUps: z
    .array(
      z.object({
        title: z.string().min(1),
        whyNot: z.string().min(1),
      }),
    )
    .max(6)
    .default([]),
});

export type StartSelectionModel = z.infer<typeof startSelectionSchema>;
