import { z } from "zod";

// Local seam surgery: two adjacent beats are FIXED, and a story is found
// between them. Scouting decides the machinery and what to fetch; patching
// writes either a free-standing mini paragraph or a rewritten opening.

export const seamScoutSchema = z.object({
  mechanism: z.enum([
    "changed_conditions",
    "created_demand",
    "object_travels",
    "person_travels",
    "parallel_joined",
    "pure_sequence",
  ]),
  /** The story found between the two events, in two or three sentences. */
  sketch: z.string().min(1),
  /** Pages to fetch: the intermediary the story runs through, if any. */
  huntFor: z.array(z.string()).max(3).default([]),
  /** Background subjects from the draft the seam should lean on, if any. */
  usesBackground: z.array(z.string()).default([]),
});

export const seamPatchSchema = z.object({
  mode: z.enum(["insert", "rewrite_opening"]),
  /** A free-standing mini paragraph placed between the beats. */
  insertParagraph: z.string().default(""),
  /** The next beat in full, with only its opening changed. */
  revisedNextBeat: z.string().default(""),
  /** The event the seam runs on, for the record. */
  carrier: z.string().default(""),
});
