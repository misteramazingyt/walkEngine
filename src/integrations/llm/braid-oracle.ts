import type { BraidOracle } from "@/domain/braid/types";
import { beatCompositionSchema } from "@/schemas/braid";
import { loadPrompt } from "./prompt-files";
import type { LanguageModelProvider } from "./provider";

// Writes one beat at a time, carrying the previous beat's prose forward so
// the paragraphs join. The plan decides what is live; this only writes it.

export class LlmBraidOracle implements BraidOracle {
  constructor(private readonly provider: LanguageModelProvider) {}

  async composeBeat(input: Parameters<BraidOracle["composeBeat"]>[0]) {
    const supporting = input.supporting
      .map(
        (s) =>
          `  ${s.id} | ${s.label}${s.firstMention ? " [FIRST MENTION — introduce indefinitely]" : ""}\n     ${s.gloss}`,
      )
      .join("\n");
    const planted = input.planted
      .map((p) => `  ${p.id} | ${p.label}\n     ${p.gloss}`)
      .join("\n");

    const result = await this.provider.generateStructured({
      promptId: "braid-beat.v1",
      system: loadPrompt("braid-beat.v1"),
      user: [
        `THE WHOLE ROUTE CULMINATES IN: ${input.seedLabel}`,
        `BEAT ${input.beat.index}${input.isFirst ? " — the opening beat, begin in an ordinary scene" : ""}${input.isLast ? " — the final beat, it must land on the culmination" : ""}`,
        // The topic's id has to be here: the beat reports which subjects it
        // mentioned, and without an id for the topic it can only ever report
        // the supporting cast, so every beat looks like it forgot its own
        // subject.
        `TOPIC: ${input.topic.subject.id} | ${input.topic.subject.label} (beat ${input.beat.topicRun} of its run)\nACCOUNT:\n${input.topicAccount}`,
        supporting.length > 0
          ? `SUPPORTING SUBJECTS, already live:\n${supporting}`
          : "SUPPORTING SUBJECTS: none yet — this is the opening.",
        planted.length > 0
          ? `PLANT THESE, in passing, WITHOUT EXPLAINING THEM:\n${planted}`
          : "",
        input.previousProse
          ? `PREVIOUS BEAT, continue from it:\n${input.previousProse}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: beatCompositionSchema,
      temperature: 0.7,
      // A beat is only ~200 words, but gemini-2.5 draws its reasoning from
      // the same output budget, so a limit sized to the prose truncates the
      // JSON mid-string and fails validation rather than returning a short
      // paragraph.
      maxTokens: 6000,
    });

    return {
      prose: result.prose,
      plantSentence: result.plantSentence,
      mentioned: result.mentioned,
    };
  }
}
