import { z } from "zod";

// Which sampled pages may carry a beat. The walk's archive is connected, so
// a page can be present purely by adjacency; this is the judgment that
// separates being reachable from being about something.

export const topicSelectionSchema = z.object({
  kept: z
    .array(
      z.object({
        id: z.string().min(1),
        /** One sentence, in the seed's own terms, on what this page bears. */
        bearing: z.string().min(1),
      }),
    )
    .default([]),
  dropped: z
    .array(
      z.object({
        id: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .default([]),
});

export type TopicSelectionModel = z.infer<typeof topicSelectionSchema>;
