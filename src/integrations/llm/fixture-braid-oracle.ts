import type { BraidOracle } from "@/domain/braid/types";

// Deterministic stand-in. It imitates the SHAPE of a beat — a topic, named
// supporting subjects, an unexplained plant — so the composition pipeline
// and its checks can be exercised offline. The prose is a placeholder and
// is marked as such in every sentence, because fixture output that reads
// like real output is how a stub gets mistaken for a result.

export class FixtureBraidOracle implements BraidOracle {
  /**
   * Keeps everything. Deliberately: a fixture that silently pruned would
   * hide whether the real selection is doing any work, and the test that
   * matters is that a route survives its judge, not that a stub agrees.
   */
  async selectTopics(input: Parameters<BraidOracle["selectTopics"]>[0]) {
    return {
      kept: input.candidates.map((c) => ({
        id: c.id,
        bearing: `fixture: ${c.label} kept without judgment`,
      })),
      dropped: [],
    };
  }

  async composeBeat(input: Parameters<BraidOracle["composeBeat"]>[0]) {
    const supporting = input.supporting.map((s) => s.label);
    const plantSentence =
      input.planted.length > 0
        ? `fixture plant: ${input.planted.map((p) => p.label).join(", ")} named but not explained.`
        : "";

    const prose = [
      `fixture beat ${input.beat.index} on ${input.topic.subject.label}`,
      `(topic run ${input.beat.topicRun}).`,
      supporting.length > 0
        ? `fixture support drawn from ${supporting.join(", ")}.`
        : "fixture: no supporting subjects live yet.",
      plantSentence,
      input.isLast ? `fixture culmination on ${input.seedLabel}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      prose,
      plantSentence,
      // A fixture that claimed to mention everything would hide exactly the
      // drift the mention check exists to catch, so it reports only what the
      // prose above actually names.
      mentioned: [
        input.topic.subject.id,
        ...input.supporting.map((s) => s.id),
        ...input.planted.map((p) => p.id),
      ],
    };
  }
}
