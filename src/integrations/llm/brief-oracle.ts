import type { BriefOracle, ParsedBrief } from "@/domain/brief/types";
import { briefSchema } from "@/schemas/brief";
import { loadPrompt } from "./prompt-files";
import type { LanguageModelProvider } from "./provider";

// Reads a writer's paragraph and returns the configuration it implies,
// together with an account of what it could not express.

export class LlmBriefOracle implements BriefOracle {
  constructor(private readonly provider: LanguageModelProvider) {}

  async parse(input: { brief: string }): Promise<ParsedBrief> {
    const result = await this.provider.generateStructured({
      promptId: "parse-brief.v1",
      system: loadPrompt("parse-brief.v1"),
      user: `BRIEF:\n${input.brief}`,
      schema: briefSchema,
      temperature: 0.2,
      maxTokens: 6000,
    });
    return result;
  }
}
