// Seeded random numbers (mulberry32). The whole state is one uint32, so it saves and restores exactly.
// Same seed + same moves = same pieces, which is what a future Daily Challenge needs.

export class Rng {
  state: number;
  constructor(seed: number) { this.state = seed >>> 0; }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number { return Math.floor(this.next() * n); }

  /** Pick an index by weight. Returns -1 if every weight is 0. */
  weighted(weights: readonly number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return -1;
    let roll = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll < 0) return i;
    }
    return weights.length - 1;
  }
}

/** Turn any string (a date, a name) into a seed, for daily challenges. */
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
