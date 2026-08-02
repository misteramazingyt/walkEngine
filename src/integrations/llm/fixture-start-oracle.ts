import type { StartOracle, StartSelection } from "@/domain/walk/types";

// Deterministic stand-in for LlmStartOracle, used by LLM_MODE=fixture and by
// tests. It imitates the shape of the decision, not its quality: candidates
// are ranked by how many seed words they echo, which is precisely the
// resemblance heuristic the real prompt is written to resist. Nothing here
// should be read as evidence that the choice is any good.

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "to", "for", "by", "with",
  "is", "are", "was", "were", "be", "been", "as", "at", "that", "this", "it",
  "from", "how", "what", "why", "which", "their", "its",
]);

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

export class FixtureStartOracle implements StartOracle {
  /** Force a specific pick, so a test can drive the off-list rejection. */
  constructor(private readonly forcedTitle?: string) {}

  async chooseStart(input: {
    seedInfo: string;
    guidance: string;
    candidates: Array<{ title: string; summary: string }>;
  }): Promise<StartSelection> {
    if (input.candidates.length === 0) {
      throw new Error("Fixture start oracle was given no candidates");
    }
    if (this.forcedTitle !== undefined) {
      return {
        title: this.forcedTitle,
        reason: `fixture: forced start "${this.forcedTitle}"`,
        runnerUps: [],
      };
    }

    const wanted = new Set(terms(`${input.seedInfo} ${input.guidance}`));
    const scored = input.candidates.map((candidate, index) => {
      const hits = terms(`${candidate.title} ${candidate.summary}`).filter(
        (w) => wanted.has(w),
      ).length;
      return { candidate, index, hits };
    });
    scored.sort((a, b) => b.hits - a.hits || a.index - b.index);

    return {
      title: scored[0].candidate.title,
      reason: `fixture: ${scored[0].hits} seed term(s) echoed by "${scored[0].candidate.title}"`,
      runnerUps: scored.slice(1, 4).map((s) => ({
        title: s.candidate.title,
        whyNot: `fixture: echoed ${s.hits} seed term(s)`,
      })),
    };
  }
}
