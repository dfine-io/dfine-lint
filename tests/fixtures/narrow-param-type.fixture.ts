// narrow-param-type — usage-ratio (>=10 props, <25% used) + partial-type-param.
type BigObj = {
  a: number; b: number; c: number; d: number; e: number; f: number;
  g: number; h: number; i: number; j: number; k: number;
};
type Cfg = { x: number; y: number; z: number };

// POSITIVE: 11-prop param, only 1 used (~9%)
export function ratio(obj: BigObj) { // EXPECT: narrow-param-type
  return obj.a;
}

// POSITIVE: Partial<Cfg> with a single field used
export function partial(cfg: Partial<Cfg>) { // EXPECT: narrow-param-type
  return cfg.x;
}

// NEGATIVE: small param (under threshold)
export function small(p: { a: number }) {
  return p.a;
}
