import { describe, expect, it } from "vitest";
import { createRng } from "@/domain/walk/prng";

describe("seeded PRNG", () => {
  it("produces identical sequences for identical seeds", () => {
    const a = createRng("motif-walk");
    const b = createRng("motif-walk");
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = createRng("seed-one");
    const b = createRng("seed-two");
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("pins the exact sequence (golden values guard cross-version drift)", () => {
    const rng = createRng("golden");
    const values = Array.from({ length: 4 }, () => rng.next());
    // If this test ever fails, deployed walks stop being reproducible:
    // treat it as a breaking change, never update the values casually.
    expect(values).toEqual([
      0.4075229768641293, 0.7687626387923956, 0.9099586096126586,
      0.49994390457868576,
    ]);
  });

  it("samples without replacement and within bounds", () => {
    const rng = createRng("sampling");
    const items = ["a", "b", "c", "d", "e"];
    const sampled = rng.sample(items, 3);
    expect(sampled).toHaveLength(3);
    expect(new Set(sampled).size).toBe(3);
    for (const s of sampled) expect(items).toContain(s);
    expect(rng.sample(items, 99)).toHaveLength(5);
    expect(rng.sample([], 3)).toHaveLength(0);
  });

  it("rejects invalid int bounds and empty picks", () => {
    const rng = createRng("guards");
    expect(() => rng.int(0)).toThrow();
    expect(() => rng.pick([])).toThrow();
  });
});
