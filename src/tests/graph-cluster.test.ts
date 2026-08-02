import { describe, expect, it } from "vitest";
import { detectClusters, partitionStability } from "@/domain/graph/cluster";
import { computeMetrics, isGenuineBridge } from "@/domain/graph/metrics";
import { clusterComplementarity, pageIntelligibility } from "@/domain/graph/packet";
import { RELATION_WEIGHTS, type ArchiveEdge, type ArchiveNode } from "@/domain/graph/types";

// A synthetic graph with two dense communities joined by one bridge, plus a
// generic hub linked to everything. Community detection must separate the
// communities; the bridge test must distinguish the bridge from the hub.

function edge(a: string, b: string, weight = RELATION_WEIGHTS.outlink): ArchiveEdge {
  return { sourceId: a, targetId: b, relationType: "outlink", weight, provenance: "test" };
}

function node(id: string, extra: Partial<ArchiveNode> = {}): ArchiveNode {
  return {
    id,
    title: id,
    url: `https://x/${id}`,
    summary: `${id} is a fixture page about ${id}.`,
    length: 8000,
    categories: [],
    entityTypes: [],
    level: 1,
    episodeIds: [],
    ...extra,
  };
}

const LEFT = ["l1", "l2", "l3", "l4"];
const RIGHT = ["r1", "r2", "r3", "r4"];

function buildGraph() {
  const nodeIds = [...LEFT, ...RIGHT, "bridge", "hub"];
  const edges: ArchiveEdge[] = [];
  // Two dense triangulated communities.
  for (const group of [LEFT, RIGHT]) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        edges.push(edge(group[i], group[j], 1));
      }
    }
  }
  // A single bridge joining them, of modest degree.
  edges.push(edge("l1", "bridge", 1));
  edges.push(edge("bridge", "r1", 1));
  // A hub linked to everything — central but generic.
  for (const id of [...LEFT, ...RIGHT]) edges.push(edge("hub", id, 0.2));
  return { nodeIds, edges };
}

describe("graph metrics", () => {
  it("personalized PageRank concentrates near the seed region", () => {
    const { nodeIds, edges } = buildGraph();
    const metrics = computeMetrics(nodeIds, edges, ["l1"]);
    const left = LEFT.reduce(
      (s, id) => s + (metrics.personalizedPageRank.get(id) ?? 0),
      0,
    );
    const right = RIGHT.reduce(
      (s, id) => s + (metrics.personalizedPageRank.get(id) ?? 0),
      0,
    );
    expect(left).toBeGreaterThan(right);
    const total = [...metrics.personalizedPageRank.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 3);
  });

  it("recognizes a genuine bridge when it actually carries the paths", () => {
    // Without a universal hub, the bridge is the only route between the
    // communities, so it carries the shortest paths.
    const { nodeIds, edges } = buildGraph();
    const withoutHub = edges.filter(
      (e) => e.sourceId !== "hub" && e.targetId !== "hub",
    );
    const ids = nodeIds.filter((id) => id !== "hub");
    const metrics = computeMetrics(ids, withoutHub, ["l1"]);
    expect(metrics.betweenness.get("bridge")).toBeGreaterThan(0.5);
    expect(isGenuineBridge("bridge", metrics, 2)).toBe(true);
  });

  it("refuses a high-centrality generic hub, which is the whole point", () => {
    const { nodeIds, edges } = buildGraph();
    const metrics = computeMetrics(nodeIds, edges, ["l1"]);
    // A page linked to everything wins on centrality...
    expect(metrics.betweenness.get("hub")).toBeGreaterThan(
      metrics.betweenness.get("bridge") ?? 0,
    );
    // ...and its degree percentile is maximal...
    expect(metrics.hubScore.get("hub")).toBeGreaterThan(
      metrics.hubScore.get("bridge") ?? 0,
    );
    // ...so the hub penalty rejects it. Centrality is not bridgehood.
    expect(isGenuineBridge("hub", metrics, 2, { maxHub: 0.9 })).toBe(false);
  });
});

describe("community detection", () => {
  it("recovers the two planted communities", () => {
    const { nodeIds, edges } = buildGraph();
    const metrics = computeMetrics(nodeIds, edges, ["l1"]);
    const result = detectClusters({ nodeIds, edges, metrics, minClusterSize: 3 });

    expect(result.clusters.length).toBeGreaterThanOrEqual(2);
    const leftCluster = result.clusters.find((c) => c.memberIds.includes("l1"));
    const rightCluster = result.clusters.find((c) => c.memberIds.includes("r1"));
    expect(leftCluster).toBeDefined();
    expect(rightCluster).toBeDefined();
    expect(leftCluster!.id).not.toBe(rightCluster!.id);
    // Planted communities stay together.
    for (const id of LEFT) expect(leftCluster!.memberIds).toContain(id);
    for (const id of RIGHT) expect(rightCluster!.memberIds).toContain(id);
  });

  it("is deterministic: the same graph clusters identically every time", () => {
    const { nodeIds, edges } = buildGraph();
    const metrics = computeMetrics(nodeIds, edges, ["l1"]);
    const a = detectClusters({ nodeIds, edges, metrics, minClusterSize: 3 });
    const b = detectClusters({ nodeIds, edges, metrics, minClusterSize: 3 });
    expect(a.clusters.map((c) => c.memberIds)).toEqual(
      b.clusters.map((c) => c.memberIds),
    );
    expect(a.chosenResolution).toBe(b.chosenResolution);
  });

  it("evaluates several resolutions and picks by a composite, not by modularity alone", () => {
    const { nodeIds, edges } = buildGraph();
    const metrics = computeMetrics(nodeIds, edges, ["l1"]);
    const result = detectClusters({ nodeIds, edges, metrics, minClusterSize: 3 });
    expect(result.resolutionReports.length).toBe(3);
    for (const report of result.resolutionReports) {
      expect(report.stability).toBeGreaterThanOrEqual(0);
      expect(report.stability).toBeLessThanOrEqual(1);
      expect(report.composite).toBeGreaterThan(0);
    }
    const best = result.resolutionReports.reduce((a, b) =>
      b.composite > a.composite ? b : a,
    );
    expect(result.chosenResolution).toBe(best.resolution);
  });

  it("returns nothing rather than inventing clusters in a tiny graph", () => {
    const nodeIds = ["a", "b"];
    const edges = [edge("a", "b")];
    const metrics = computeMetrics(nodeIds, edges, ["a"]);
    expect(detectClusters({ nodeIds, edges, metrics }).clusters).toHaveLength(0);
  });

  it("partition stability is 1 for identical partitions and lower otherwise", () => {
    const ids = ["a", "b", "c", "d"];
    const p = { a: 0, b: 0, c: 1, d: 1 };
    const q = { a: 0, b: 1, c: 0, d: 1 };
    expect(partitionStability(p, p, ids)).toBe(1);
    expect(partitionStability(p, q, ids)).toBeLessThan(1);
  });
});

describe("packet heuristics", () => {
  it("rates a dated, situated, widely-linked page as more intelligible", () => {
    const concrete = node("Marine chronometer", {
      entityTypes: ["instrument"],
      eraStart: 1730,
      coord: { lat: 51.5, lon: -0.1 },
      sitelinks: 42,
      summary: "A marine chronometer is a precise clock used at sea.",
    });
    const abstract = node("Epistemology", {
      entityTypes: ["field", "concept"],
      sitelinks: 5,
      summary:
        "Epistemology is the branch of philosophy concerned with the theory of knowledge and the conditions under which belief constitutes knowledge, a question pursued across many traditions.",
    });
    expect(pageIntelligibility(concrete)).toBeGreaterThan(
      pageIntelligibility(abstract),
    );
  });

  it("scores a cluster of near-identical pages below a mixed one", () => {
    const repetitive = [1, 2, 3, 4].map((i) =>
      node(`same${i}`, {
        entityTypes: ["concept"],
        summary: "This page concerns collective behaviour in public settings.",
      }),
    );
    const mixed = [
      node("Carnival", { entityTypes: ["festival"], eraStart: 1200, summary: "A festival with role reversal in the streets." }),
      node("Herald", { entityTypes: ["social_role"], eraStart: 1300, summary: "An officer who proclaimed announcements publicly." }),
      node("Charivari", { entityTypes: ["practice"], eraStart: 1400, summary: "A noisy public shaming ritual directed at offenders." }),
      node("Guild", { entityTypes: ["institution"], eraStart: 1100, summary: "An association regulating a craft and its members." }),
    ];
    const internal: ArchiveEdge[] = [edge("Carnival", "Herald"), edge("Herald", "Charivari")];
    expect(clusterComplementarity(mixed, internal)).toBeGreaterThan(
      clusterComplementarity(repetitive, []),
    );
  });
});
