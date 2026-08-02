import type {
  LanguageModelProvider,
  StructuredGenerationRequest,
  TextGenerationRequest,
} from "./provider";

/**
 * Deterministic provider for tests and the seed demonstration fixture.
 * Responses are registered per promptId; an unregistered promptId is a hard
 * error — the mock never invents content.
 */
export class MockLanguageModelProvider implements LanguageModelProvider {
  private structured = new Map<string, unknown>();
  private text = new Map<string, string>();

  registerStructured(promptId: string, response: unknown): void {
    this.structured.set(promptId, response);
  }

  registerText(promptId: string, response: string): void {
    this.text.set(promptId, response);
  }

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<T> {
    if (!this.structured.has(request.promptId)) {
      throw new Error(
        `MockLanguageModelProvider: no structured response registered for "${request.promptId}"`,
      );
    }
    // Validate through the same Zod schema the real provider would use, so
    // fixtures that drift from the schema fail in tests, not in production.
    return request.schema.parse(this.structured.get(request.promptId));
  }

  async generateText(request: TextGenerationRequest): Promise<string> {
    const response = this.text.get(request.promptId);
    if (response === undefined) {
      throw new Error(
        `MockLanguageModelProvider: no text response registered for "${request.promptId}"`,
      );
    }
    return response;
  }
}
