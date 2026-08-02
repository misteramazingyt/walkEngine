import type { z } from "zod";

// Domain logic must depend on this interface, never on a concrete model or
// vendor SDK. The Anthropic implementation arrives with Phase 4; until then
// the mock provider (mock-provider.ts) is the only implementation and powers
// all automated tests.

export interface StructuredGenerationRequest<T> {
  /** Versioned prompt identifier, e.g. "backward-plan.v1". */
  promptId: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  temperature?: number;
  maxTokens?: number;
}

export interface TextGenerationRequest {
  promptId: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LanguageModelProvider {
  generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<T>;
  generateText(request: TextGenerationRequest): Promise<string>;
}
