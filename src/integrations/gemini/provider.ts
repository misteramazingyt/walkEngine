import { z } from "zod";
import type {
  LanguageModelProvider,
  StructuredGenerationRequest,
  TextGenerationRequest,
} from "@/integrations/llm/provider";

// Gemini implementation of LanguageModelProvider (Generative Language API,
// JSON mode). Contract per CLAUDE.md: structured outputs are Zod-validated;
// on invalid output the original response is preserved, ONE retry carries
// the validation errors back to the model, and a second failure is loud.
// Malformed fields are never silently coerced.

const DEFAULT_MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiStructuredOutputError extends Error {
  constructor(
    message: string,
    public readonly rawResponse: string,
    public readonly validationIssues: string,
  ) {
    super(message);
    this.name = "GeminiStructuredOutputError";
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

export class GeminiProvider implements LanguageModelProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set — Burke walks and orchestration need it",
      );
    }
    this.apiKey = apiKey;
    this.model = options?.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  }

  private async call(options: {
    system: string;
    user: string;
    json: boolean;
    temperature: number;
    maxTokens: number;
  }): Promise<string> {
    const response = await fetch(`${API_BASE}/${this.model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.system }] },
        contents: [{ role: "user", parts: [{ text: options.user }] }],
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
          ...(options.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });

    const body = (await response.json().catch(() => ({}))) as GeminiResponse;
    if (!response.ok) {
      throw new Error(
        `Gemini API ${response.status}: ${body.error?.message ?? "unknown error"}`,
      );
    }
    if (body.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked the prompt: ${body.promptFeedback.blockReason}`);
    }
    const candidate = body.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? "").join("");
    // A response cut off at the token ceiling is still "text", and still
    // unparseable — which surfaced four walks in a row as "Response was not
    // valid JSON", a message that sends you looking at the schema instead of
    // the budget. Say which it was. Note that gemini-2.5 spends reasoning
    // tokens from this same ceiling, so the limit is never just the prose.
    if (candidate?.finishReason === "MAX_TOKENS") {
      throw new Error(
        `Gemini hit its ${options.maxTokens}-token output ceiling before finishing` +
          " (reasoning tokens are drawn from this budget too); raise maxTokens" +
          " for this call or ask it for less at once",
      );
    }
    if (text.trim().length === 0) {
      throw new Error(
        `Gemini returned no text (finishReason: ${candidate?.finishReason ?? "none"})`,
      );
    }
    return text;
  }

  async generateText(request: TextGenerationRequest): Promise<string> {
    return this.call({
      system: request.system,
      user: request.user,
      json: false,
      temperature: request.temperature ?? 0.7,
      maxTokens: request.maxTokens ?? 4096,
    });
  }

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<T> {
    const jsonSchema = JSON.stringify(z.toJSONSchema(request.schema));
    const user = `${request.user}\n\nRespond with a single JSON object conforming exactly to this JSON Schema:\n${jsonSchema}`;

    const attempt = async (extra: string): Promise<{ raw: string; parsed?: T; issues?: string }> => {
      const raw = await this.call({
        system: request.system,
        user: user + extra,
        json: true,
        temperature: request.temperature ?? 0.2,
        maxTokens: request.maxTokens ?? 16384,
      });
      let candidate: unknown;
      try {
        candidate = JSON.parse(raw);
      } catch {
        return { raw, issues: "Response was not valid JSON." };
      }
      const result = request.schema.safeParse(candidate);
      if (result.success) return { raw, parsed: result.data };
      return {
        raw,
        issues: result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      };
    };

    const first = await attempt("");
    if (first.parsed !== undefined) return first.parsed;

    // Preserve the original response for debugging before retrying once.
    console.error(
      `[gemini] invalid structured output for ${request.promptId}; retrying once. Issues: ${first.issues}\nRaw: ${first.raw.slice(0, 2000)}`,
    );

    const second = await attempt(
      `\n\nYour previous response failed validation with these errors:\n${first.issues}\nPrevious response:\n${first.raw.slice(0, 4000)}\nReturn a corrected JSON object.`,
    );
    if (second.parsed !== undefined) return second.parsed;

    throw new GeminiStructuredOutputError(
      `Gemini structured output failed validation twice for ${request.promptId}: ${second.issues}`,
      second.raw,
      second.issues ?? "unknown",
    );
  }
}
