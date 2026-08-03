import { describe, expect, it } from "vitest";
import { titleExclusionReason } from "@/domain/walk/exclusions";
import { composeBraid } from "@/domain/braid/compose";
import { planBraid, type BraidSource } from "@/domain/braid/plan";
import type { BraidOracle } from "@/domain/braid/types";
import type {
  AcceptedSubjectCluster,
  BurkeClusterState,
  Subject,
} from "@/domain/burkecluster/types";

// Three failures found by reading a real composition, fixed together:
// the walk chased an illustration away from its seed, reference works
// arrived as though they were historical subjects, and a beat opened by
// repeating its predecessor.

describe("exclusion of reference works", () => {
  const cfg = { excludeMetaPages: true };

  it("rejects a catalogue named mid-title", () => {
    // The case that reached a composition: every rule was prefix-anchored.
    expect(titleExclusionReason("AFI Catalog of Feature Films", cfg)).toBe(
      "catalogue page",
    );
  });

  it("rejects bibliographies, filmographies and encyclopedias", () => {
    expect(titleExclusionReason("Bibliography of Thomas Paine", cfg)).toBeTruthy();
    expect(titleExclusionReason("Woody Allen filmography", cfg)).toBeTruthy();
    expect(
      titleExclusionReason("Encyclopedia of Islam", cfg),
    ).toBeTruthy();
  });

  it("rejects non-article namespaces", () => {
    expect(titleExclusionReason("Category:1863 in the United States", cfg)).toBe(
      "non-article namespace",
    );
    expect(titleExclusionReason("Template:Civil War", cfg)).toBeTruthy();
  });

  it("still admits ordinary articles that merely contain the words", () => {
    expect(titleExclusionReason("Abraham Lincoln", cfg)).toBeNull();
    expect(titleExclusionReason("Union army", cfg)).toBeNull();
    // "Catalogue" as part of a thing's name, not "catalogue of" a field.
    expect(titleExclusionReason("Messier object", cfg)).toBeNull();
  });
});

function source(pages: string[]): BraidSource {
  const subject = (id: string, constitutive: string[] = []): Subject =>
    ({
      id,
      label: id,
      type: "practice",
      synthesized: false,
      centralPageTitle: constitutive[0] ?? id,
      constitutivePages: constitutive,
      audienceAnchor: `a picture of ${id}`,
    }) as Subject;

  const state = {
    seed: {
      rawInput: "seed",
      resolvedPages: [],
      fixedNarrativeEndpoint: true,
      endpointRevisions: [],
    },
    attention: {} as never,
    currentSubject: subject("the-culmination"),
    acceptedClusters: [
      {
        subject: subject("arc", pages),
        clusterId: "cluster-arc",
        packet: { representativeTitles: [], topByRelevance: [] } as never,
        narration: { account: "an account" } as never,
        stability: 0.5,
        discoveryIndex: 0,
      },
    ] as AcceptedSubjectCluster[],
    transitions: [],
    rejectedClusters: [],
    rejectedSubjects: [],
    cycles: [],
    discoveryOrder: ["arc"],
    dependencyOrder: [],
    presentationOrder: [],
    wrapAround: null,
    budget: {} as never,
  } as BurkeClusterState;

  return {
    state,
    pages: new Map(
      pages.map((t) => [
        t,
        { title: t, summary: `A reasonably long lead summary about ${t}.` },
      ]),
    ),
  };
}

describe("braid page selection", () => {
  it("keeps reference works out of the topic sequence", () => {
    const plan = planBraid(
      source(["Abraham Lincoln", "AFI Catalog of Feature Films", "Union army"]),
    );
    const labels = plan.beats.map(
      (b) => plan.live.get(b.topicSubjectId)!.subject.label,
    );
    expect(labels).toContain("Abraham Lincoln");
    expect(labels).toContain("Union army");
    expect(labels).not.toContain("AFI Catalog of Feature Films");
  });
});

describe("braid composition quality checks", () => {
  it("records a beat that opens by repeating its predecessor", async () => {
    const repeated =
      "The regiment mustered in the winter of 1863 and its officers were drawn from abolitionist families across New England.";
    const oracle: BraidOracle = {
      async composeBeat(input) {
        return {
          prose:
            input.beat.index === 1
              ? repeated
              : `${repeated} And then something further was said.`,
          plantSentence: "",
          mentioned: [
            input.topic.subject.id,
            ...input.supporting.map((s) => s.id),
            ...input.planted.map((p) => p.id),
          ],
        };
      },
    };
    const { composition } = await composeBraid({
      source: source(["Abraham Lincoln", "Union army"]),
      oracle,
      seedLabel: "the-culmination",
    });
    expect(
      composition.notes.some((n) => /opens by repeating the previous beat/.test(n)),
    ).toBe(true);
  });

  it("says nothing when consecutive beats genuinely differ", async () => {
    const oracle: BraidOracle = {
      async composeBeat(input) {
        return {
          prose: `A wholly distinct paragraph number ${input.beat.index}, sharing no opening with any other, and going somewhere new.`,
          plantSentence: "",
          mentioned: [
            input.topic.subject.id,
            ...input.supporting.map((s) => s.id),
            ...input.planted.map((p) => p.id),
          ],
        };
      },
    };
    const { composition } = await composeBraid({
      source: source(["Abraham Lincoln", "Union army"]),
      oracle,
      seedLabel: "the-culmination",
    });
    expect(composition.notes.filter((n) => /repeating/.test(n))).toHaveLength(0);
  });
});
