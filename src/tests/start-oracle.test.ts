import { describe, expect, it, vi } from "vitest";
import { LlmStartOracle } from "@/integrations/llm/start-oracle";
import { FixtureStartOracle } from "@/integrations/llm/fixture-start-oracle";
import { MockLanguageModelProvider } from "@/integrations/llm/mock-provider";
import { startSelectionSchema } from "@/schemas/start";

// An LLM-determined start is a choice among pages that were found, never a
// title the model composed. These cover the contract on both sides: what the
// oracle is given, and what the schema will accept back.

const CANDIDATES = [
  { title: "Assaying", summary: "Determining the composition of an ore." },
  { title: "Coinage", summary: "The minting of standardized metal money." },
  { title: "Measurement", summary: "The assignment of numbers to magnitudes." },
];

describe("start selection schema", () => {
  it("defaults runner-ups to an empty list", () => {
    const parsed = startSelectionSchema.parse({
      title: "Assaying",
      reason: "The walk can pursue standards from here.",
    });
    expect(parsed.runnerUps).toEqual([]);
  });

  it("rejects a selection with no reason", () => {
    expect(() =>
      startSelectionSchema.parse({ title: "Assaying", reason: "" }),
    ).toThrow();
  });
});

describe("LlmStartOracle", () => {
  it("shows the model every candidate and asks for a verbatim title", async () => {
    const provider = new MockLanguageModelProvider();
    provider.registerStructured("choose-start.v1", {
      title: "Coinage",
      reason: "Standardization is contested there rather than assumed.",
      runnerUps: [{ title: "Measurement", whyNot: "Too abstract to travel." }],
    });
    const spy = vi.spyOn(provider, "generateStructured");
    const oracle = new LlmStartOracle(provider);

    const selection = await oracle.chooseStart({
      seedInfo: "how trust in metal became trust in a stamp",
      guidance: "somewhere concrete",
      candidates: CANDIDATES,
    });

    expect(selection.title).toBe("Coinage");
    expect(selection.runnerUps).toHaveLength(1);
    const seenUser = spy.mock.calls[0][0].user;
    for (const candidate of CANDIDATES) {
      expect(seenUser).toContain(candidate.title);
    }
    expect(seenUser).toContain("somewhere concrete");
    expect(seenUser).toContain("verbatim");
  });
});

describe("FixtureStartOracle", () => {
  it("chooses a candidate rather than inventing one", async () => {
    const selection = await new FixtureStartOracle().chooseStart({
      seedInfo: "the minting of money and standardized coinage",
      guidance: "",
      candidates: CANDIDATES,
    });
    expect(CANDIDATES.map((c) => c.title)).toContain(selection.title);
    expect(selection.title).toBe("Coinage");
  });

  it("is deterministic for the same seed material", async () => {
    const oracle = new FixtureStartOracle();
    const input = {
      seedInfo: "ore composition and assaying practice",
      guidance: "",
      candidates: CANDIDATES,
    };
    const a = await oracle.chooseStart(input);
    const b = await oracle.chooseStart(input);
    expect(a.title).toBe(b.title);
  });

  it("refuses to choose from an empty candidate list", async () => {
    await expect(
      new FixtureStartOracle().chooseStart({
        seedInfo: "anything",
        guidance: "",
        candidates: [],
      }),
    ).rejects.toThrow(/no candidates/i);
  });
});
