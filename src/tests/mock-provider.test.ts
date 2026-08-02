import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MockLanguageModelProvider } from "@/integrations/llm/mock-provider";

describe("MockLanguageModelProvider", () => {
  const schema = z.object({ selectedNodeId: z.string() });
  const request = {
    promptId: "endpoint-selection.v1",
    system: "You are a historical narrative planner.",
    user: "Choose the strongest endpoint.",
    schema,
  };

  it("returns registered structured responses validated by the schema", async () => {
    const provider = new MockLanguageModelProvider();
    provider.registerStructured("endpoint-selection.v1", {
      selectedNodeId: "node-42",
    });
    await expect(provider.generateStructured(request)).resolves.toEqual({
      selectedNodeId: "node-42",
    });
  });

  it("fails loudly when a fixture does not match the schema", async () => {
    const provider = new MockLanguageModelProvider();
    provider.registerStructured("endpoint-selection.v1", { wrong: true });
    await expect(provider.generateStructured(request)).rejects.toThrow();
  });

  it("never invents content for unregistered prompts", async () => {
    const provider = new MockLanguageModelProvider();
    await expect(provider.generateStructured(request)).rejects.toThrow(
      /no structured response registered/,
    );
    await expect(
      provider.generateText({ ...request }),
    ).rejects.toThrow(/no text response registered/);
  });
});
