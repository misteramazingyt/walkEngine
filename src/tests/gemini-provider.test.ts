import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  GeminiProvider,
  GeminiStructuredOutputError,
} from "@/integrations/gemini/provider";

// The provider's contract, tested against a mocked fetch: JSON mode,
// Zod validation, exactly one retry carrying validation errors, loud
// failure with the raw response preserved. No live API calls.

function geminiBody(text: string) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
    }),
  } as Response;
}

const schema = z.object({ chosenTitle: z.string(), confidence: z.number() });
const request = {
  promptId: "test.v1",
  system: "system",
  user: "user",
  schema,
};

afterEach(() => vi.unstubAllGlobals());

describe("GeminiProvider", () => {
  it("refuses to construct without an API key", () => {
    const prior = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    expect(() => new GeminiProvider()).toThrow(/GEMINI_API_KEY/);
    if (prior) process.env.GEMINI_API_KEY = prior;
  });

  it("parses a valid structured response on the first attempt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      geminiBody(JSON.stringify({ chosenTitle: "Coinage", confidence: 0.8 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GeminiProvider({ apiKey: "test-key" });
    await expect(provider.generateStructured(request)).resolves.toEqual({
      chosenTitle: "Coinage",
      confidence: 0.8,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("retries once with validation errors, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiBody(JSON.stringify({ chosenTitle: 42 })))
      .mockResolvedValueOnce(
        geminiBody(JSON.stringify({ chosenTitle: "Lydia", confidence: 0.5 })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GeminiProvider({ apiKey: "test-key" });
    await expect(provider.generateStructured(request)).resolves.toEqual({
      chosenTitle: "Lydia",
      confidence: 0.5,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The retry prompt must carry the validation errors and the raw response.
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    const retryText = retryBody.contents[0].parts[0].text as string;
    expect(retryText).toContain("failed validation");
    expect(retryText).toContain("chosenTitle");
  });

  it("fails visibly after the second invalid result, preserving the raw response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(geminiBody("not json at all"));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GeminiProvider({ apiKey: "test-key" });
    const error = await provider.generateStructured(request).catch((e) => e);
    expect(error).toBeInstanceOf(GeminiStructuredOutputError);
    expect((error as GeminiStructuredOutputError).rawResponse).toBe(
      "not json at all",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2); // exactly one retry
  });

  it("surfaces API errors and safety blocks instead of inventing content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: "quota exceeded" } }),
      } as Response),
    );
    const provider = new GeminiProvider({ apiKey: "test-key" });
    await expect(provider.generateText(request)).rejects.toThrow(/429.*quota/);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ promptFeedback: { blockReason: "SAFETY" } }),
      } as Response),
    );
    await expect(provider.generateText(request)).rejects.toThrow(/blocked/);
  });
});
