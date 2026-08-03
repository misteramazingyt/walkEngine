import { describe, expect, it } from "vitest";
import { planBraid, type BraidSource } from "@/domain/braid/plan";
import { BRAID_DEFAULTS } from "@/domain/braid/types";
import type {
  AcceptedSubjectCluster,
  BurkeClusterState,
  Subject,
} from "@/domain/burkecluster/types";

// Two claims are under test. First, quantity: Connections moves the topic
// 29-43 times per episode, so a plan built from three cluster-level subjects
// is the wrong shape, and topics are drawn from the PAGES inside each
// cluster instead. Second, latency: a subject may hold the topic only after
// it is already live, which makes the plant structural rather than asserted.

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

function cluster(
  id: string,
  index: number,
  pages: string[],
  representatives: string[] = [],
): AcceptedSubjectCluster {
  return {
    subject: subject(id, pages),
    clusterId: `cluster-${id}`,
    packet: { representativeTitles: representatives } as never,
    narration: { account: `an account of ${id}` } as never,
    stability: 0.5,
    discoveryIndex: index,
  } as AcceptedSubjectCluster;
}

function source(options: {
  clusters: Array<{ id: string; pages: string[]; representatives?: string[] }>;
  shortSummaryFor?: string[];
  seed?: string | null;
}): BraidSource {
  const titles = options.clusters.flatMap((c) => [
    ...c.pages,
    ...(c.representatives ?? []),
  ]);
  const short = new Set(options.shortSummaryFor ?? []);
  const state = {
    seed: {
      rawInput: "seed",
      resolvedPages: [],
      fixedNarrativeEndpoint: true,
      endpointRevisions: [],
    },
    attention: {} as never,
    currentSubject:
      options.seed === null ? null : subject(options.seed ?? "the-culmination"),
    acceptedClusters: options.clusters.map((c, i) =>
      cluster(c.id, i, c.pages, c.representatives),
    ),
    transitions: [],
    rejectedClusters: [],
    rejectedSubjects: [],
    cycles: [],
    discoveryOrder: options.clusters.map((c) => c.id),
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
        {
          title: t,
          summary: short.has(t)
            ? "tiny"
            : `A reasonably long lead summary about ${t}.`,
        },
      ]),
    ),
  };
}

const labelsOf = (plan: ReturnType<typeof planBraid>) =>
  plan.beats.map((b) => plan.live.get(b.topicSubjectId)!.subject.label);

describe("braid plan", () => {
  it("takes its topics from the pages inside clusters, not the clusters", () => {
    const plan = planBraid(
      source({
        clusters: [
          { id: "arc-a", pages: ["Plough", "Manor"], representatives: ["Ox"] },
          { id: "arc-b", pages: ["Radar"], representatives: ["Magnetron"] },
        ],
      }),
    );
    const labels = labelsOf(plan);
    expect(labels).toContain("Plough");
    expect(labels).toContain("Magnetron");
    expect(labels).not.toContain("arc-a");
  });

  it("produces far more topics than the walk accepted subjects", () => {
    const plan = planBraid(
      source({
        clusters: [
          {
            id: "arc-a",
            pages: ["P1", "P2", "P3", "P4"],
            representatives: ["R1", "R2", "R3", "R4", "R5"],
          },
          {
            id: "arc-b",
            pages: ["Q1", "Q2", "Q3"],
            representatives: ["S1", "S2", "S3", "S4"],
          },
        ],
      }),
    );
    // Two accepted clusters, sixteen pages, plus the seed.
    expect(new Set(plan.beats.map((b) => b.topicSubjectId)).size).toBeGreaterThan(12);
  });

  it("presents the later-discovered arc first and closes on the seed", () => {
    const plan = planBraid(
      source({
        clusters: [
          { id: "first-found", pages: ["A1"] },
          { id: "last-found", pages: ["B1"] },
        ],
      }),
    );
    const labels = labelsOf(plan);
    expect(labels[0]).toBe("B1");
    expect(labels[labels.length - 1]).toBe("the-culmination");
  });

  it("records which arc each page-topic belongs to", () => {
    const plan = planBraid(
      source({
        clusters: [
          { id: "arc-a", pages: ["Plough"] },
          { id: "arc-b", pages: ["Radar"] },
        ],
      }),
    );
    expect(plan.arcs.get("page:Plough")).toBe("arc-a");
    expect(plan.arcs.get("page:Radar")).toBe("arc-b");
  });

  it("skips a page with no usable summary rather than making it a topic", () => {
    const plan = planBraid(
      source({
        clusters: [{ id: "arc-a", pages: ["Plough", "Stub"] }],
        shortSummaryFor: ["Stub"],
      }),
    );
    const labels = labelsOf(plan);
    expect(labels).toContain("Plough");
    expect(labels).not.toContain("Stub");
  });

  it("plants every topic but the first before it takes the floor", () => {
    const plan = planBraid(
      source({
        clusters: [
          { id: "arc-a", pages: ["P1", "P2", "P3"], representatives: ["R1", "R2"] },
        ],
      }),
    );
    for (const entry of plan.live.values()) {
      if (entry.topicBeats.length === 0) continue;
      if (entry.topicBeats[0] === 1) continue;
      expect(entry.enteredAtBeat).toBeLessThan(entry.topicBeats[0]);
    }
    expect(plan.diagnostics.topicsWithoutPlant).toBe(1);
  });

  it("keeps many subjects live at once, not two", () => {
    const plan = planBraid(
      source({
        clusters: [
          {
            id: "arc-a",
            pages: ["P1", "P2", "P3", "P4", "P5"],
            representatives: ["R1", "R2", "R3", "R4", "R5", "R6", "R7"],
          },
        ],
      }),
    );
    expect(plan.diagnostics.medianLiveAtOnce).toBeGreaterThanOrEqual(8);
  });

  it("holds each topic for the measured single beat by default", () => {
    expect(BRAID_DEFAULTS.topicBeats).toBe(1);
    const plan = planBraid(
      source({ clusters: [{ id: "arc-a", pages: ["P1", "P2"] }] }),
    );
    expect(plan.diagnostics.medianTopicRun).toBe(1);
  });

  it("produces no beats when nothing was accepted and there is no seed", () => {
    expect(planBraid(source({ clusters: [], seed: null })).beats).toHaveLength(0);
  });
});
