import type { StartOracle, StartSelection } from "@/domain/walk/types";
import { startSelectionSchema } from "@/schemas/start";
import { loadPrompt } from "./prompt-files";
import type { LanguageModelProvider } from "./provider";

// The judgment faculty for an LLM-determined start. Mode-agnostic: it sees
// whatever seed material the mode carries and a candidate list drawn from
// search, and names one candidate. Verifying that the named title is
// actually on the list is the caller's job — this class does not decide
// what happens when the model answers off-list.

export class LlmStartOracle implements StartOracle {
  constructor(private readonly provider: LanguageModelProvider) {}

  async chooseStart(input: {
    seedInfo: string;
    guidance: string;
    candidates: Array<{ title: string; summary: string }>;
  }): Promise<StartSelection> {
    const result = await this.provider.generateStructured({
      promptId: "choose-start.v1",
      system: loadPrompt("choose-start.v1"),
      user: [
        `SEED MATERIAL:\n${input.seedInfo || "(none given)"}`,
        input.guidance.trim().length > 0
          ? `WHAT THE AUTHOR WANTS FROM THE START:\n${input.guidance}`
          : "",
        `CANDIDATE PAGES (choose exactly one, by its title verbatim):\n${input.candidates
          .map((c, i) => `${i + 1}. ${c.title}\n   ${c.summary}`)
          .join("\n")}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: startSelectionSchema,
      temperature: 0.4,
    });

    return {
      title: result.title,
      reason: result.reason,
      runnerUps: result.runnerUps,
    };
  }
}
