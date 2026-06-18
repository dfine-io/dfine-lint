// prefer-optional-chain — a && a.b / a.b && a.b.c / a != null && a.b → use a?.b.
declare const o: { b: { c: number } };
declare const p: { b: number } | null;
declare const x: boolean;
declare const y: boolean;

// POSITIVE: a.b && a.b.c
export const a = o.b && o.b.c; // EXPECT: prefer-optional-chain

// POSITIVE: a != null && a.b
export const b = p != null && p.b; // EXPECT: prefer-optional-chain

// NEGATIVE: unrelated && operands
export const n1 = o.b && p;

// NEGATIVE: plain boolean &&
export const n2 = x && y;
