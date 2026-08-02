import { describe, expect, it } from "vitest";
import {
  defaultWalkConfiguration,
  walkConfigurationSchema,
} from "@/schemas/walk-configuration";
import { CRITERIA } from "@/domain/enums";

describe("walkConfigurationSchema", () => {
  it("applies the spec defaults", () => {
    const config = defaultWalkConfiguration();
    expect(config.walkMode).toBe("RANDOM");
    expect(config.walkLength).toBe(12);
    expect(config.branchFactor).toBe(20);
    expect(config.maxGraphRequests).toBe(150);
    expect(config.language).toBe("en");
    expect(config.allowRevisits).toBe(false);
    expect(config.excludeMetaPages).toBe(true);
    expect(config.endpointStrategy).toBe("WALK_FINAL");
    expect(config.draftTargetWords).toEqual({ min: 1800, max: 2500 });
  });

  it("defaults the historical-consciousness controls per spec", () => {
    const config = defaultWalkConfiguration();
    expect(config.historicalConsciousness).toEqual({
      actorHorizon: true,
      contemporaryRivalHorizon: false,
      laterCanonicalInterpretation: true,
      presentDayInheritedMotif: true,
      immanentCritique: true,
      newMotifDiscovery: false,
    });
  });

  it("includes every criterion with weight 0 by default", () => {
    const config = defaultWalkConfiguration();
    expect(Object.keys(config.criteriaWeights).sort()).toEqual(
      [...CRITERIA].sort(),
    );
    for (const criterion of CRITERIA) {
      expect(config.criteriaWeights[criterion]).toBe(0);
    }
  });

  it("rejects out-of-range values instead of coercing them", () => {
    expect(() => walkConfigurationSchema.parse({ walkLength: 1 })).toThrow();
    expect(() =>
      walkConfigurationSchema.parse({
        criteriaWeights: { documentedInfluence: 6 },
      }),
    ).toThrow();
    expect(() =>
      walkConfigurationSchema.parse({
        draftTargetWords: { min: 3000, max: 2000 },
      }),
    ).toThrow();
    expect(() =>
      walkConfigurationSchema.parse({ walkMode: "VIBES" }),
    ).toThrow();
  });

  it("round-trips through JSON without loss", () => {
    const config = walkConfigurationSchema.parse({
      walkMode: "CRITERIOLOGICAL",
      seed: "fixture-seed",
      criteriaWeights: { motifAffinity: 4.5, surprise: 2 },
      temporalBounds: { start: -600, end: 1950 },
      pathDescription: "Favor concrete objects and institutions.",
    });
    const reparsed = walkConfigurationSchema.parse(
      JSON.parse(JSON.stringify(config)),
    );
    expect(reparsed).toEqual(config);
    expect(reparsed.criteriaWeights.motifAffinity).toBe(4.5);
    expect(reparsed.temporalBounds).toEqual({ start: -600, end: 1950 });
  });
});
