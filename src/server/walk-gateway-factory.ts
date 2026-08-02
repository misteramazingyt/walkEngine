import type { StartResolver, WalkGateway } from "@/domain/walk/types";
import { FixtureWikipediaGateway } from "@/integrations/wikipedia/fixture-gateway";
import { WikipediaGateway } from "@/integrations/wikipedia/gateway";

// WIKIPEDIA_MODE=fixture swaps the live MediaWiki gateway for the
// deterministic demonstration graph — used in tests and offline development.
// Anything else (including unset) means live Wikipedia.

export type FullGateway = WalkGateway & StartResolver;

export function createWalkGateway(
  language: string,
  budget: number,
): FullGateway {
  if (process.env.WIKIPEDIA_MODE === "fixture") {
    return new FixtureWikipediaGateway(undefined, budget);
  }
  return new WikipediaGateway(language, budget);
}
