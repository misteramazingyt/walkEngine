import type { BriefOracle, ParsedBrief } from "@/domain/brief/types";

// Deterministic parse for offline runs and tests. It splits on the first
// sentence boundary, which is a plausible-looking rule and a bad one — the
// point of the real parser is that briefs do not divide there. Reported
// readings say "fixture" so nothing here can be mistaken for comprehension.

export class FixtureBriefOracle implements BriefOracle {
  async parse(input: { brief: string }): Promise<ParsedBrief> {
    const trimmed = input.brief.trim();
    const split = trimmed.indexOf(". ");
    const seedText = split > 0 ? trimmed.slice(0, split + 1) : trimmed;
    const attention = split > 0 ? trimmed.slice(split + 2) : "";
    return {
      seedText,
      attentionProgram: attention.length > 0 ? attention : "fixture: no attention text",
      temporalStart: null,
      temporalEnd: null,
      subjectCount: 4,
      reading: "fixture: split the brief at its first sentence boundary",
      unhonoured: ["fixture parser reads no instruction beyond the first full stop"],
    };
  }
}
