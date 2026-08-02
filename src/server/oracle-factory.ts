import type { BurkeOracle } from "@/domain/burke/types";
import type { AnamnesisOracle } from "@/domain/anamnesis/types";
import { GeminiProvider } from "@/integrations/gemini/provider";
import { LlmBurkeOracle } from "@/integrations/llm/burke-oracle";
import { FixtureBurkeOracle } from "@/integrations/llm/fixture-burke-oracle";
import { LlmAnamnesisOracle } from "@/integrations/llm/anamnesis-oracle";
import { FixtureAnamnesisOracle } from "@/integrations/llm/fixture-anamnesis-oracle";

// LLM_MODE=fixture (or fixture Wikipedia mode) swaps the Gemini-backed
// oracles for deterministic fixtures. Without a GEMINI_API_KEY the factory
// throws — an LLM-driven walk fails loudly rather than inventing content.

function fixturesEnabled(): boolean {
  return (
    process.env.LLM_MODE === "fixture" ||
    process.env.WIKIPEDIA_MODE === "fixture"
  );
}

export function createBurkeOracle(): BurkeOracle {
  if (fixturesEnabled()) return new FixtureBurkeOracle();
  return new LlmBurkeOracle(new GeminiProvider());
}

export function createAnamnesisOracle(): AnamnesisOracle {
  if (fixturesEnabled()) return new FixtureAnamnesisOracle();
  return new LlmAnamnesisOracle(new GeminiProvider());
}
