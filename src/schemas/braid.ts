import { z } from "zod";

// One beat of braided prose. The model is given a topic, a supporting cast
// that is already live, and possibly something to plant; it returns the
// paragraph plus an account of which subjects it actually mentioned, so the
// plan can be checked against the writing rather than trusted.

export const beatCompositionSchema = z.object({
  /** The paragraph itself. Roughly 200 words — the measured topic residence. */
  prose: z.string().min(1),
  /**
   * The clause that introduces a planted subject without explaining it.
   * Empty when the beat plants nothing.
   */
  plantSentence: z.string().default(""),
  /** Subject ids the prose refers to, by the caller's ids. */
  mentioned: z.array(z.string()).default([]),
});

export type BeatCompositionModel = z.infer<typeof beatCompositionSchema>;
