// Deterministic seeded PRNG: xmur3 string hash feeding an sfc32 generator.
// Implemented in-repo (rather than depending on seedrandom) so the exact
// sequence is pinned by our own golden-value tests: identical seeds must
// reproduce identical walks across machines, Node versions, and deploys.
// Never use Math.random() in walk code.

function xmur3(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export interface SeededRng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Uniform pick from a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /**
   * Up to `count` distinct items sampled without replacement, preserving
   * nothing of the input order (Fisher–Yates over a copy).
   */
  sample<T>(items: readonly T[], count: number): T[];
}

export function createRng(seed: string): SeededRng {
  const hash = xmur3(seed);
  const next = sfc32(hash(), hash(), hash(), hash());

  const int = (n: number): number => {
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`rng.int requires a positive integer, got ${n}`);
    }
    return Math.floor(next() * n);
  };

  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error("rng.pick requires a non-empty array");
      }
      return items[int(items.length)];
    },
    sample<T>(items: readonly T[], count: number): T[] {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy.slice(0, Math.max(0, Math.min(count, copy.length)));
    },
  };
}
