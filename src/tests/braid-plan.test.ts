import { describe, expect, it } from "vitest";
import { planBraid } from "@/domain/braid/plan";
import { BRAID_DEFAULTS } from "@/domain/braid/types";
import type {
  AcceptedSubjectCluster,
  BurkeClusterState,
  Subject,
} from "@/domain/burkecluster/types";

// The braid's governing claim: a subject may hold the topic only after it is
// already live, so latency is a property of the plan rather than a sentence
// the model wrote. These fix that, and the retention of runners-up that
// makes a live set possible at all.

function subject(id: string, label = id): Subject {
  return {
    id,
    label,
    type: "practice",
    synthesized: false,
    centralPageTitle: label,
    constitutivePages: [label],
    audienceAnchor: `a picture of ${label}`,
  } as Subject;
}

function accepted(id: string, index: number): AcceptedSubjectCluster {
  return {
    subject: subject(id),
    clusterId: `cluster-${id}`,
    packet: null as never,
    narration: null,
    stability: 0.5,
    discoveryIndex: index,
  } as AcceptedSubjectCluster;
}

function state(options: {
  accepted: string[];
  runnersUp?: string[];
}): BurkeClusterState {
  const cycles = (options.runnersUp ?? []).map((id, i) => ({
    cycle: i + 1,
    originTitles: [],
    deficiencyId: null,
    deficiencyStatement: null,
    episodes: [],
    nodesSampled: 0,
    edgesBuilt: 0,
    clustering: {} as never,
    interpreted: [
      { clusterId: `c-${id}`, subject: subject(id), total: 1 - i * 0.01 },
    ],
  }));
  return {
    seed: {
      rawInput: "seed",
      resolvedPages: [],
      fixedNarrativeEndpoint: true,
      endpointRevisions: [],
    },
    attention: {} as never,
    currentSubject: subject("seed-subject"),
    acceptedClusters: options.accepted.map((id, i) => accepted(id, i)),
    transitions: [],
    rejectedClusters: [],
    rejectedSubjects: [],
    cycles: cycles as never,
    discoveryOrder: options.accepted,
    dependencyOrder: [],
    presentationOrder: [],
    wrapAround: null,
    budget: {} as never,
  } as BurkeClusterState;
}

describe("braid plan", () => {
  it("presents subjects in reverse discovery order, ending on the seed", () => {
    const plan = planBraid(state({ accepted: ["a", "b", "c"] }));
    expect(plan.topicOrder).toEqual(["c", "b", "a", "seed-subject"]);
  });

  it("gives each topic the measured residence of two beats", () => {
    const plan = planBraid(state({ accepted: ["a", "b"] }));
    expect(plan.diagnostics.medianTopicRun).toBe(BRAID_DEFAULTS.topicBeats);
    expect(plan.beats.filter((b) => b.topicSubjectId === "b")).toHaveLength(2);
  });

  it("plants every later topic before it carries the topic", () => {
    const plan = planBraid(state({ accepted: ["a", "b", "c"] }));
    for (const entry of plan.live.values()) {
      if (entry.topicBeats.length === 0) continue;
      const firstTopic = entry.topicBeats[0];
      // The opening subject has no earlier beat to be planted in; every
      // other topical subject must have entered before it took the floor.
      if (firstTopic === 1) continue;
      expect(entry.enteredAtBeat).toBeLessThan(firstTopic);
    }
    expect(plan.diagnostics.topicsWithoutPlant).toBe(1);
  });

  it("keeps discarded runners-up live as supporting subjects", () => {
    const plan = planBraid(
      state({ accepted: ["a", "b"], runnersUp: ["r1", "r2", "r3"] }),
    );
    expect(plan.diagnostics.supportingOnlySubjects).toBeGreaterThan(0);
    const supporting = new Set(plan.beats.flatMap((b) => b.supportingSubjectIds));
    expect([...supporting].some((id) => id.startsWith("r"))).toBe(true);
  });

  it("never makes a runner-up topical, since nothing narrated it", () => {
    const plan = planBraid(
      state({ accepted: ["a"], runnersUp: ["r1", "r2", "r3", "r4"] }),
    );
    const topics = new Set(plan.beats.map((b) => b.topicSubjectId));
    for (const id of topics) {
      expect(plan.live.get(id)?.narrated).toBe(true);
    }
  });

  it("carries several subjects at once rather than passing a baton", () => {
    const plan = planBraid(
      state({
        accepted: ["a", "b", "c"],
        runnersUp: ["r1", "r2", "r3", "r4", "r5", "r6"],
      }),
    );
    expect(plan.diagnostics.medianLiveAtOnce).toBeGreaterThan(3);
  });

  it("closes a subject once its tail has run out", () => {
    const plan = planBraid(
      state({ accepted: ["a", "b", "c", "d", "e"] }),
      { ...BRAID_DEFAULTS, tailBeats: 1 },
    );
    const last = plan.beats[plan.beats.length - 1];
    // With a one-beat tail the earliest subjects must have dropped out.
    expect(last.recedingSubjectIds.length).toBeLessThan(4);
  });

  it("produces no beats when nothing was accepted", () => {
    const empty = state({ accepted: [] });
    empty.currentSubject = null;
    expect(planBraid(empty).beats).toHaveLength(0);
  });
});
