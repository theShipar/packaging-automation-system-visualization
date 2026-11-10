/** mulberry32 step: returns [value in [0,1), next state]. Engine-only; never call at render time. */
export function next(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stand-alone seeded generator for history fixtures (not part of session state). */
export function makeRng(seed: number) {
  let s = seed | 0;
  const rnd = () => {
    const [v, n] = next(s);
    s = n;
    return v;
  };
  const gauss = () => {
    const u = Math.max(rnd(), 1e-9);
    const v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { rnd, gauss, int: (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1)) };
}
