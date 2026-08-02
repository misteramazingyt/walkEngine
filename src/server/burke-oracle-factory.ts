import type { BurkeOracle } from "@/domain/burke/types";
import { GeminiProvider } from "@/integrations/gemini/provider";
import { LlmBurkeOracle } from "@/integrations/llm/burke-oracle";
import { FixtureBurkeOracle } from "@/integrations/llm/fixture-burke-oracle";

// LLM_MODE=fixture (or fixture Wikipedia mode) swaps the Gemini-backed
// oracle for the deterministic fixture. Without a GEMINI_API_KEY the
// factory throws — a Burke walk fails loudly rather than inventing content.

export function createBurkeOracle(): BurkeOracle {
  if (
    process.env.LLM_MODE === "fixture" ||
    process.env.WIKIPEDIA_MODE === "fixture"
  ) {
    return new FixtureBurkeOracle({ stabilizeAfterCheckpoint: 2 });
  }
  return new LlmBurkeOracle(new GeminiProvider());
}
