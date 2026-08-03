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

// Test oracles judge nothing; selection is exercised in its own tests.
const keepAll: BraidOracle["selectTopics"] = async (input) => ({
  kept: input.candidates.map((c) => ({ id: c.id, bearing: "kept for the test" })),
  dropped: [],
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
      selectTopics: keepAll,
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
      selectTopics: keepAll,
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

describe("topics are judged against the seed, not taken by adjacency", () => {
  it("drops pages the judge refuses, however well connected", async () => {
    // The real failure: Bibcode, ArXiv and Australia became narrative
    // subjects because the archive is connected, not because they bear on
    // anything. Adjacency is not aboutness.
    const judged: string[] = [];
    const oracle: BraidOracle = {
      async selectTopics(input) {
        judged.push(...input.candidates.map((c) => c.label));
        const bears = (label: string) =>
          !["Bibcode", "ArXiv", "Australia"].includes(label);
        return {
          kept: input.candidates
            .filter((c) => bears(c.label))
            .map((c) => ({ id: c.id, bearing: `${c.label} bears on the seed` })),
          dropped: input.candidates
            .filter((c) => !bears(c.label))
            .map((c) => ({ id: c.id, reason: "citation apparatus, not a subject" })),
        };
      },
      async composeBeat(input) {
        return {
          prose: "a paragraph",
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
      source: source(["Abraham Lincoln", "Bibcode", "ArXiv", "Australia", "Union army"]),
      oracle,
      seedLabel: "the-culmination",
    });

    const topics = composition.beats.map((b) => b.topicLabel);
    expect(judged).toContain("Bibcode");
    expect(topics).toContain("Abraham Lincoln");
    expect(topics).not.toContain("Bibcode");
    expect(topics).not.toContain("ArXiv");
    expect(topics).not.toContain("Australia");
    expect(composition.notes.some((n) => /kept 2 of 5/.test(n))).toBe(true);
  });

  it("tells each beat what it must establish about the seed", async () => {
    const bearings: string[] = [];
    const oracle: BraidOracle = {
      async selectTopics(input) {
        return {
          kept: input.candidates.map((c) => ({
            id: c.id,
            bearing: `${c.label} shows the seed's problem in one place`,
          })),
          dropped: [],
        };
      },
      async composeBeat(input) {
        bearings.push(input.topicBearing);
        return { prose: "x", plantSentence: "", mentioned: [input.topic.subject.id] };
      },
    };
    await composeBraid({
      source: source(["Abraham Lincoln"]),
      oracle,
      seedLabel: "the-culmination",
    });
    expect(bearings[0]).toContain("shows the seed's problem");
  });
});
