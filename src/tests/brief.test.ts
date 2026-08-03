import { describe, expect, it, vi } from "vitest";
import { briefSchema } from "@/schemas/brief";
import { LlmBriefOracle } from "@/integrations/llm/brief-oracle";
import { FixtureBriefOracle } from "@/integrations/llm/fixture-brief-oracle";
import { MockLanguageModelProvider } from "@/integrations/llm/mock-provider";
import { walkConfigurationSchema } from "@/schemas/walk-configuration";

// A brief is one paragraph carrying several kinds of instruction. Parsing it
// is a real operation with a real failure mode, and the failure that matters
// is silent dropping — an instruction the configuration cannot express must
// be reported, not quietly discarded.

const BRIEF =
  "the meaning of life is exactly what you make it. over a large time scale, " +
  "pay special attention to disputes over 'meaning of life' according to " +
  "average and ordinary individuals and how the resources/technologies " +
  "available to them shaped how they made meaning for themselves. privilege " +
  "beats oscillating between material culture and internal self-understanding, " +
  "like that of Kierkegaard and Augustine.";

describe("brief schema", () => {
  it("accepts a parse with unbounded dates and defaults unhonoured to empty", () => {
    const parsed = briefSchema.parse({
      seedText: "the meaning of life is exactly what you make it",
      attentionProgram: "attend to ordinary individuals and their tools",
      subjectCount: 6,
      reading: "a long-scale route through material culture and self-understanding",
    });
    expect(parsed.temporalStart).toBeNull();
    expect(parsed.unhonoured).toEqual([]);
  });

  it("refuses a subject count the walk configuration could not hold", () => {
    const base = {
      seedText: "x",
      attentionProgram: "y",
      reading: "z",
    };
    expect(() => briefSchema.parse({ ...base, subjectCount: 1 })).toThrow();
    expect(() => briefSchema.parse({ ...base, subjectCount: 40 })).toThrow();
  });

  it("keeps BCE years, which a large time scale needs", () => {
    const parsed = briefSchema.parse({
      seedText: "x",
      attentionProgram: "y",
      reading: "z",
      subjectCount: 6,
      temporalStart: -400,
      temporalEnd: 2000,
    });
    expect(parsed.temporalStart).toBe(-400);
  });
});

describe("LlmBriefOracle", () => {
  it("shows the model the whole brief and returns the parse", async () => {
    const provider = new MockLanguageModelProvider();
    provider.registerStructured("parse-brief.v1", {
      seedText: "the meaning of life is exactly what you make it",
      attentionProgram: "ordinary individuals; tools; material culture; inwardness",
      temporalStart: -400,
      temporalEnd: 2000,
      subjectCount: 6,
      reading: "a long route between things people had and what they made of themselves",
      unhonoured: ["the request to alternate beats cannot be set as a rule"],
    });
    const spy = vi.spyOn(provider, "generateStructured");

    const parsed = await new LlmBriefOracle(provider).parse({ brief: BRIEF });

    expect(parsed.temporalStart).toBe(-400);
    expect(parsed.unhonoured).toHaveLength(1);
    // The whole brief reaches the model — including the trailing instruction
    // that is easiest to lose.
    expect(spy.mock.calls[0][0].user).toContain("Kierkegaard");
    expect(spy.mock.calls[0][0].user).toContain("oscillating");
  });
});

describe("a parsed brief maps onto a runnable configuration", () => {
  it("produces a configuration the application would accept", async () => {
    const parsed = await new FixtureBriefOracle().parse({ brief: BRIEF });
    const configuration = walkConfigurationSchema.parse({
      walkMode: "BURKECLUSTER",
      start: { kind: "LLM", value: "" },
      temporalBounds: { start: parsed.temporalStart, end: parsed.temporalEnd },
      burkeCluster: {
        seedText: parsed.seedText,
        attentionProgram: parsed.attentionProgram,
        minimumSubjectCount: Math.max(2, parsed.subjectCount - 1),
        maxSubjectDepth: parsed.subjectCount,
      },
    });
    expect(configuration.walkMode).toBe("BURKECLUSTER");
    expect(configuration.burkeCluster.seedText).toContain("meaning of life");
    expect(configuration.start.kind).toBe("LLM");
  });

  it("reports what it could not express rather than dropping it", async () => {
    const parsed = await new FixtureBriefOracle().parse({ brief: BRIEF });
    expect(parsed.unhonoured.length).toBeGreaterThan(0);
  });
});

describe("interpretation tolerates omitted optional fields", () => {
  it("accepts an interpretation that simply has no rejection reason", async () => {
    const { interpretationSchema } = await import("@/schemas/burkecluster");
    const scores = Object.fromEntries(
      [
        "deficiencyFit", "subjectEmergencePotential", "clusterStability",
        "complementarity", "historicalSpecificity", "immanentTransitionStrength",
        "narrativePivotPotential", "personalizedRelevance", "audienceIntelligibility",
        "concreteAnchorStrength", "attentionProgramFit", "surprise",
        "endpointReturnPotential", "genericAbstraction", "weakDeficiencyRelation",
        "semanticRedundancy", "forcedHistoricalRelation", "listPageArtifact",
        "sensationalDetour", "excessiveObscurity",
      ].map((k) => [k, 0.5]),
    );
    // Exactly the shape a real run produced: an accepted cluster, with the
    // rejectionReason key simply absent. Requiring it failed the walk after
    // every archive request had been spent.
    const parsed = interpretationSchema.parse({
      interpretations: [
        {
          clusterId: "c1",
          subject: {
            id: "s1",
            label: "A subject",
            type: "practice",
            centralPageTitle: "A page",
            synthesized: false,
            constitutivePages: ["A page"],
            audienceAnchor: "something to picture",
          },
          scores,
        },
      ],
    });
    expect(parsed.interpretations[0].rejectionReason).toBeNull();
    expect(parsed.interpretations[0].subjectScores).toBeNull();
    expect(parsed.interpretations[0].whyThisSubjectOrganizesTheCluster).toBe("");
  });
});
