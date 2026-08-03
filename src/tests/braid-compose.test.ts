import { describe, expect, it, vi } from "vitest";
import { composeBraid } from "@/domain/braid/compose";
import { FixtureBraidOracle } from "@/integrations/llm/fixture-braid-oracle";
import type { BraidOracle } from "@/domain/braid/types";
import type {
  AcceptedSubjectCluster,
  BurkeClusterState,
  Subject,
} from "@/domain/burkecluster/types";

function subject(id: string): Subject {
  return {
    id,
    label: id,
    type: "practice",
    synthesized: false,
    centralPageTitle: id,
    constitutivePages: [id],
    audienceAnchor: `a picture of ${id}`,
  } as Subject;
}

function state(accepted: string[], runnersUp: string[] = []): BurkeClusterState {
  return {
    seed: {
      rawInput: "seed",
      resolvedPages: [],
      fixedNarrativeEndpoint: true,
      endpointRevisions: [],
    },
    attention: {} as never,
    currentSubject: subject("culmination"),
    acceptedClusters: accepted.map((id, i) => ({
      subject: subject(id),
      clusterId: `cluster-${id}`,
      packet: null as never,
      narration: { account: `an account of ${id}` } as never,
      stability: 0.5,
      discoveryIndex: i,
    })) as AcceptedSubjectCluster[],
    transitions: [],
    rejectedClusters: [],
    rejectedSubjects: [],
    cycles: runnersUp.map((id, i) => ({
      cycle: i + 1,
      interpreted: [{ clusterId: `c-${id}`, subject: subject(id), total: 1 - i * 0.01 }],
    })) as never,
    discoveryOrder: accepted,
    dependencyOrder: [],
    presentationOrder: [],
    wrapAround: null,
    budget: {} as never,
  } as BurkeClusterState;
}

describe("braid composition", () => {
  it("writes one beat per planned beat, in order", async () => {
    const { plan, composition } = await composeBraid({
      state: state(["a", "b"], ["r1", "r2"]),
      oracle: new FixtureBraidOracle(),
      seedLabel: "culmination",
    });
    expect(composition.beats).toHaveLength(plan.beats.length);
    expect(composition.beats.map((b) => b.index)).toEqual(
      plan.beats.map((b) => b.index),
    );
  });

  it("introduces a subject indefinitely only on its first appearance", async () => {
    const seen: boolean[][] = [];
    const oracle: BraidOracle = {
      async composeBeat(input) {
        seen.push(input.supporting.map((s) => s.firstMention));
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
      state: state(["a", "b", "c"], ["r1", "r2"]),
      oracle,
      seedLabel: "culmination",
    });
    // Once a subject has been mentioned it is never offered as first again.
    const later = seen.slice(2).flat();
    expect(later.filter(Boolean).length).toBeLessThan(seen.flat().length);
  });

  it("records a plant the writing failed to make", async () => {
    const oracle: BraidOracle = {
      async composeBeat(input) {
        // Mentions the topic and nothing else — every plant is dropped.
        return {
          prose: "only the topic",
          plantSentence: "",
          mentioned: [input.topic.subject.id],
        };
      },
    };
    const { composition } = await composeBraid({
      state: state(["a", "b"], ["r1"]),
      oracle,
      seedLabel: "culmination",
    });
    expect(composition.notes.some((n) => /planned to plant/.test(n))).toBe(true);
  });

  it("records a beat that never mentions its own topic", async () => {
    const oracle: BraidOracle = {
      async composeBeat() {
        return { prose: "elsewhere entirely", plantSentence: "", mentioned: [] };
      },
    };
    const { composition } = await composeBraid({
      state: state(["a"]),
      oracle,
      seedLabel: "culmination",
    });
    expect(composition.notes.some((n) => /never mentions its own topic/.test(n))).toBe(
      true,
    );
  });

  it("carries the previous beat's prose forward so paragraphs join", async () => {
    const previous: string[] = [];
    const oracle: BraidOracle = {
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
      state: state(["a", "b"]),
      oracle,
      seedLabel: "culmination",
    });
    expect(previous[0]).toBe("");
    expect(previous[1]).toBe("beat 1");
    expect(previous[2]).toBe("beat 2");
  });

  it("says plainly when there is nothing to braid", async () => {
    const empty = state([]);
    empty.currentSubject = null;
    const { composition } = await composeBraid({
      state: empty,
      oracle: new FixtureBraidOracle(),
      seedLabel: "culmination",
    });
    expect(composition.beats).toHaveLength(0);
    expect(composition.notes[0]).toMatch(/nothing to braid/);
  });

  it("reports progress for every beat", async () => {
    const onProgress = vi.fn();
    const { plan } = await composeBraid({
      state: state(["a", "b"]),
      oracle: new FixtureBraidOracle(),
      seedLabel: "culmination",
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledTimes(plan.beats.length);
  });
});
