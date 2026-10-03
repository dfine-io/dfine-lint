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

// POSITIVE: await inside finally block (no catch — a rejected await can mask the try error)
export async function awaitInFinally() {
  try {
    return 1;
  } finally {
    await Promise.resolve(); // EXPECT: correctness
  }
}

// NEGATIVE: await in finally WITH a catch that CONSUMES the error — the try error is handled in the
// catch, so the best-effort awaited cleanup cannot mask it (guaranteed-release pattern).
export async function awaitInFinallyWithCatch(): Promise<number> {
  try {
    return 1;
  } catch {
    return 0;
  } finally {
    await Promise.resolve();
  }
}

// POSITIVE: await in finally where the catch THROWS a new error — that error stays live through
// finally, so the awaited cleanup can still mask it (the catch does not consume the error).
export async function awaitInFinallyThrows(): Promise<number> {
  try {
    return 1;
  } catch {
    throw new Error("wrapped");
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
export function loopFuncShorthand() {
  const fns: Array<() => { i: number }> = [];
  for (let i = 0; i < 3; i++) {
    fns.push(() => ({ i })); // EXPECT: correctness
  }
  return fns;
}

// POSITIVE: a parameter written through destructuring
export function destructureParam(p: number, next: () => [number]) {
  [p] = next(); // EXPECT: correctness
  return p;
}

// POSITIVE: a parameter written through a shorthand pattern and a for-of head
export function shorthandParam(p: number, next: () => { p: number }) {
  ({ p } = next()); // EXPECT: correctness
  return p;
}
export function forOfParam(p: number, xs: number[]) {
  for (p of xs) { // EXPECT: correctness
    void p;
  }
}

// NEGATIVE: a parameter used as a shorthand default value is read, not written
export function defaultFrom(p: number, obj: { a?: number }) {
  let a = 0;
  ({ a = p } = obj);
  return a + p;
}

// POSITIVE: self-assignment through this
export class Box {
  size = 1;
  touch() {
    this.size = this.size; // EXPECT: correctness
  }
}

// NEGATIVE: two constants, or two narrowed strings, that hold one literal are still two values
const SCHEMA = 3;
const EXPECTED = 3;
export const sameValue = SCHEMA === EXPECTED;
export function narrowedPair(a: string, b: string) {
  if (a === "x" && b === "x") return a === b;
  return false;
}

// NEGATIVE: wrapped constants and calls that share a literal type are still two values
declare function okA(): "ok";
declare function okB(): "ok";
export const wrappedPair = (SCHEMA) === (EXPECTED);
export const callPair = okA() === okB();

// NEGATIVE: a negated bigint is another value
export const signedPair = (-1n) === (1n);

// POSITIVE: a parenthesized operand, a negated literal and a literal receiver compare to themselves
export function selfForms(x: number) {
  const p = x === (x); // EXPECT: correctness
  const q = -1 === -1; // EXPECT: correctness
  const r = "ab".length === "ab".length; // EXPECT: correctness
  const s = (1) === (1); // EXPECT: correctness
  const t = +1 === +1; // EXPECT: correctness
  const u = 1n === 1n; // EXPECT: correctness
  const v = -1n === -1n; // EXPECT: correctness
  const w = `t` === `t`; // EXPECT: correctness
  return [p, q, r, s, t, u, v, w];
}

// NEGATIVE: a catch that throws another error is no plain re-throw
export function rethrowOther(other: Error) {
  try {
    return 1;
  } catch (e) {
    throw other;
  }
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

// NEGATIVE: an arrow in the for-of iterable is created once, not per iteration
export function iterableArrow(items: number[]) {
  let scale = 2;
  scale += 1;
  const out: number[] = [];
  for (const v of items.map((x) => x * scale)) out.push(v);
  return out;
}
