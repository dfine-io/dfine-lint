// prefer-optional-chain — a && a.b / a.b && a.b.c / a != null && a.b → use a?.b.
declare const o: { b: { c: number } };
declare const p: { b: number } | null;
declare const x: boolean;
declare const y: boolean;

// POSITIVE: a.b && a.b.c
export const a = o.b && o.b.c; // EXPECT: prefer-optional-chain

// POSITIVE: a != null && a.b
export const b = p != null && p.b; // EXPECT: prefer-optional-chain

// POSITIVE: this.a && this.a.b
export class Holder {
  inner: { v: number } | null = null;
  read(): number | null {
    return this.inner && this.inner.v; // EXPECT: prefer-optional-chain
  }
}

// NEGATIVE: unrelated && operands
export const n1 = o.b && p;

// NEGATIVE: plain boolean &&
export const n2 = x && y;

// NEGATIVE: a local binding named undefined holds a value, so q != undefined is no null check
export function shadowedUndefined(q: { b: number } | null) {
  const undefined = 0;
  return q != undefined && q.b;
}
