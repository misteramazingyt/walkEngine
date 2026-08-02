import {
  RequestBudget,
  type EntityFactsGateway,
  type StartResolver,
  type WalkGateway,
} from "@/domain/walk/types";
import { FixtureWikipediaGateway } from "@/integrations/wikipedia/fixture-gateway";
import { WikipediaGateway } from "@/integrations/wikipedia/gateway";
import { WikidataGateway } from "@/integrations/wikidata/gateway";

// WIKIPEDIA_MODE=fixture swaps live Wikipedia/Wikidata for the deterministic
// demonstration graph — used in tests and offline development. Both gateways
// draw on ONE RequestBudget so maxGraphRequests bounds total HTTP requests.

export type FullGateway = WalkGateway & StartResolver;

export interface GatewayBundle {
  wikipedia: FullGateway;
  entityFacts: EntityFactsGateway;
  budget: RequestBudget;
}

export function createGatewayBundle(
  language: string,
  budgetLimit: number,
): GatewayBundle {
  const budget = new RequestBudget(budgetLimit);
  if (process.env.WIKIPEDIA_MODE === "fixture") {
    const fixture = new FixtureWikipediaGateway(undefined, budget);
    return { wikipedia: fixture, entityFacts: fixture, budget };
  }
  return {
    wikipedia: new WikipediaGateway(language, budget),
    entityFacts: new WikidataGateway(budget),
    budget,
  };
}
