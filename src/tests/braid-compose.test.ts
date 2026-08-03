import { describe, expect, it, vi } from "vitest";
import { composeBraid } from "@/domain/braid/compose";
import type { BraidSource } from "@/domain/braid/plan";
import { FixtureBraidOracle } from "@/integrations/llm/fixture-braid-oracle";
import type { BraidOracle } from "@/domain/braid/types";
import type {
  AcceptedSubjectCluster,
  BurkeClusterState,
  Subject,
} from "@/domain/burkecluster/types";

// Test oracles judge nothing; selection is exercised in its own tests.
const keepAll: BraidOracle["selectTopics"] = async (input) => ({
  kept: input.candidates.map((c) => ({ id: c.id, bearing: "kept for the test" })),
  dropped: [],
});

function subject(id: string, pages: string[] = []): Subject {
  return {
    id,
    label: id,
    type: "practice",
    synthesized: false,
    centralPageTitle: pages[0] ?? id,
    constitutivePages: pages,
    audienceAnchor: `a picture of ${id}`,
  } as Subject;
}

function source(clusters: Array<{ id: string; pages: string[] }>): BraidSource {
  const titles = clusters.flatMap((c) => c.pages);
  const state = {
    seed: {
      rawInput: "seed",
      resolvedPages: [],
      fixedNarrativeEndpoint: true,
      endpointRevisions: [],
    },
    attention: {} as never,
    currentSubject: subject("the-culmination"),
    acceptedClusters: clusters.map((c, i) => ({
      subject: subject(c.id, c.pages),
      clusterId: `cluster-${c.id}`,
      packet: { representativeTitles: [] } as never,
      narration: { account: `an account of ${c.id}` } as never,
      stability: 0.5,
      discoveryIndex: i,
    })) as AcceptedSubjectCluster[],
    transitions: [],
    rejectedClusters: [],
    rejectedSubjects: [],
    cycles: [],
    discoveryOrder: clusters.map((c) => c.id),
    dependencyOrder: [],
    presentationOrder: [],
    wrapAround: null,
    budget: {} as never,
  } as BurkeClusterState;
  return {
    state,
    pages: new Map(
      titles.map((t) => [
        t,
        { title: t, summary: `A reasonably long lead summary about ${t}.` },
      ]),
    ),
  };
}

const echoOracle = (): BraidOracle => ({
  selectTopics: keepAll,
  async composeBeat(input) {
    return {
      prose: `beat ${input.beat.index}`,
      plantSentence: "",
      mentioned: [
        input.topic.subject.id,
        ...input.supporting.map((s) => s.id),
        ...input.planted.map((p) => p.id),
      ],
    };
  },
});

describe("braid composition", () => {
  it("writes one beat per planned beat, in order", async () => {
    const { plan, composition } = await composeBraid({
      source: source([{ id: "arc", pages: ["P1", "P2", "P3"] }]),
      oracle: new FixtureBraidOracle(),
      seedLabel: "the-culmination",
    });
    expect(composition.beats).toHaveLength(plan.beats.length);
    expect(composition.beats.map((b) => b.index)).toEqual(
      plan.beats.map((b) => b.index),
    );
  });

  it("gives each page-topic its own summary to write from", async () => {
    const accounts: string[] = [];
    const oracle: BraidOracle = {
      selectTopics: keepAll,
      async composeBeat(input) {
        accounts.push(input.topicAccount);
        return { prose: "x", plantSentence: "", mentioned: [input.topic.subject.id] };
      },
    };
    await composeBraid({
      source: source([{ id: "arc", pages: ["Plough"] }]),
      oracle,
      seedLabel: "the-culmination",
    });
    // The page's own lead, not the cluster's account and not a bare label.
    expect(accounts[0]).toContain("lead summary about Plough");
  });

  it("marks a subject as a first mention only once", async () => {
    const firsts: boolean[][] = [];
    const oracle: BraidOracle = {
      selectTopics: keepAll,
      async composeBeat(input) {
        firsts.push(input.supporting.map((s) => s.firstMention));
        return {
          prose: "x",
          plantSentence: "",
          mentioned: [
            input.topic.subject.id,
            ...input.supporting.map((s) => s.id),
            ...input.planted.map((p) => p.id),
          ],
        };
      },
    };
    await composeBraid({
      source: source([{ id: "arc", pages: ["P1", "P2", "P3", "P4"] }]),
      oracle,
      seedLabel: "the-culmination",
    });
    expect(firsts.slice(-1).flat().filter(Boolean)).toHaveLength(0);
  });

  it("records a plant the writing failed to make", async () => {
    const oracle: BraidOracle = {
      selectTopics: keepAll,
      async composeBeat(input) {
        return {
          prose: "only the topic",
          plantSentence: "",
          mentioned: [input.topic.subject.id],
        };
      },
    };
    const { composition } = await composeBraid({
      source: source([{ id: "arc", pages: ["P1", "P2"] }]),
      oracle,
      seedLabel: "the-culmination",
    });
    expect(composition.notes.some((n) => /planned to plant/.test(n))).toBe(true);
  });

  it("records a beat that never mentions its own topic", async () => {
    const oracle: BraidOracle = {
      selectTopics: keepAll,
      async composeBeat() {
        return { prose: "elsewhere entirely", plantSentence: "", mentioned: [] };
      },
    };
    const { composition } = await composeBraid({
      source: source([{ id: "arc", pages: ["P1"] }]),
      oracle,
      seedLabel: "the-culmination",
    });
    expect(
      composition.notes.some((n) => /never mentions its own topic/.test(n)),
    ).toBe(true);
  });

  it("carries the previous beat's prose forward so paragraphs join", async () => {
    const previous: string[] = [];
    const oracle: BraidOracle = {
      selectTopics: keepAll,
      async composeBeat(input) {
        previous.push(input.previousProse);
        return {
          prose: `beat ${input.beat.index}`,
          plantSentence: "",
          mentioned: [input.topic.subject.id],
        };
      },
    };
    await composeBraid({
      source: source([{ id: "arc", pages: ["P1", "P2"] }]),
      oracle,
      seedLabel: "the-culmination",
    });
    expect(previous[0]).toBe("");
    expect(previous[1]).toBe("beat 1");
  });

  it("reports progress for every beat", async () => {
    const onProgress = vi.fn();
    const { plan } = await composeBraid({
      source: source([{ id: "arc", pages: ["P1", "P2"] }]),
      oracle: echoOracle(),
      seedLabel: "the-culmination",
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledTimes(plan.beats.length);
  });
});
