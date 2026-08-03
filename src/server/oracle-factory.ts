import type { BurkeOracle } from "@/domain/burke/types";
import type { AnamnesisOracle } from "@/domain/anamnesis/types";
import type { StartOracle } from "@/domain/walk/types";
import type { BraidOracle } from "@/domain/braid/types";
import { LlmBraidOracle } from "@/integrations/llm/braid-oracle";
import { FixtureBraidOracle } from "@/integrations/llm/fixture-braid-oracle";
import { GeminiProvider } from "@/integrations/gemini/provider";
import { LlmStartOracle } from "@/integrations/llm/start-oracle";
import { FixtureStartOracle } from "@/integrations/llm/fixture-start-oracle";
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

export function createBraidOracle(): BraidOracle {
  if (fixturesEnabled()) return new FixtureBraidOracle();
  return new LlmBraidOracle(new GeminiProvider());
}

// Every walk mode can be told to let the model choose its entry article, so
// this factory is reached even from the two deterministic modes — which is
// also the only LLM call those modes ever make.
export function createStartOracle(): StartOracle {
  if (fixturesEnabled()) return new FixtureStartOracle();
  return new LlmStartOracle(new GeminiProvider());
}
