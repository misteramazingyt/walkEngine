import type { BurkeClusterOracle } from "@/domain/burkecluster/types";
import { GeminiProvider } from "@/integrations/gemini/provider";
import { LlmBurkeClusterOracle } from "@/integrations/llm/burkecluster-oracle";
import { FixtureBurkeClusterOracle } from "@/integrations/llm/fixture-burkecluster-oracle";

export function createBurkeClusterOracle(): BurkeClusterOracle {
  if (
    process.env.LLM_MODE === "fixture" ||
    process.env.WIKIPEDIA_MODE === "fixture"
  ) {
    return new FixtureBurkeClusterOracle();
  }
  return new LlmBurkeClusterOracle(new GeminiProvider());
}
