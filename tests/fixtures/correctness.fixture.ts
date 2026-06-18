// correctness — bug patterns; each positive isolated on its own reported line.

// POSITIVE: self-assignment
export function selfAssign() {
  let x = 1;
  x = x; // EXPECT: correctness
  return x;
}

// POSITIVE: self-comparison
export function selfCompare(z: number) {
  return z === z; // EXPECT: correctness
}

// POSITIVE: single-iteration loop (first statement returns)
export function oneIteration(items: number[]) {
  for (const it of items) { // EXPECT: correctness
    return it;
  }
  return 0;
}

// POSITIVE: useless catch (re-throws without handling)
export function uselessCatch() {
  try {
    return 1;
  } catch (e) { // EXPECT: correctness
    throw e;
  }
}

// POSITIVE: sparse array hole
export const sparse = [1, , 3]; // EXPECT: correctness

// POSITIVE: return inside finally block
export function unsafeFinally() {
  try {
    return 1;
  } finally {
    return 2; // EXPECT: correctness
  }
}

// POSITIVE: parameter reassignment
export function paramReassign(p: number) {
  p = p + 1; // EXPECT: correctness
  return p;
}

// POSITIVE: unreachable code after return
export function unreachable() {
  return 1;
  const dead = 2; // EXPECT: correctness
  return dead;
}

// POSITIVE: parameter reassignment via increment
export function paramIncrement(p: number) {
  p++; // EXPECT: correctness
  return p;
}

// POSITIVE: setter returns a value (ignored)
export class WithSetter {
  private store = 0;
  set value(v: number) {
    this.store = v;
    return v; // EXPECT: correctness
  }
}

// POSITIVE: await inside finally block
export async function awaitInFinally() {
  try {
    return 1;
  } finally {
    await Promise.resolve(); // EXPECT: correctness
  }
}

// POSITIVE: function in loop capturing a mutable (let) loop variable
export function loopFunc() {
  const fns: Array<() => number> = [];
  for (let i = 0; i < 3; i++) {
    fns.push(() => i); // EXPECT: correctness
  }
  return fns;
}

// NEGATIVE: clean function, no issues
export function clean(a: number) {
  const b = a + 1;
  return b;
}

// NEGATIVE: function in loop capturing a const (immutable) — safe
export function loopFuncConst() {
  const fns: Array<() => number> = [];
  for (const i of [1, 2, 3]) {
    fns.push(() => i);
  }
  return fns;
}
