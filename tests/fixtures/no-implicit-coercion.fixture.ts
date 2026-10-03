// no-implicit-coercion — ==, +x, "" + x, !! in boolean context. Skips correct-type / nullish.
declare const s: string;
declare const n: number;

// POSITIVE: loose equality (non-nullish operands)
export const a = (n == 1); // EXPECT: no-implicit-coercion

// POSITIVE: unary + coercion on a string
export const b = +s; // EXPECT: no-implicit-coercion

// POSITIVE: "" + x string coercion
export const c = "" + n; // EXPECT: no-implicit-coercion

// POSITIVE: double-negation in boolean context
export function d() {
  if (!!n) return 1; // EXPECT: no-implicit-coercion
  return 0;
}

// POSITIVE: double-negation inside an && chain of a condition
export function e(flag: boolean) {
  if (!!n && flag) return 1; // EXPECT: no-implicit-coercion
  return 0;
}

// POSITIVE: double-negation as a for condition
export function f() {
  for (; !!n; ) break; // EXPECT: no-implicit-coercion
}

// NEGATIVE: "" + x where x is already a string (a literal union)
declare const mode: "a" | "b";
export const n4 = "" + mode;
declare const loud: Uppercase<string>;
export const n5 = "" + loud;
declare const tagged: `id-${string}`;
export const n6 = "" + tagged;

// NEGATIVE: strict equality
export const n1 = (n === 1);

// NEGATIVE: == null is exempt (nullish intent)
export const n2 = (s == null);

// NEGATIVE: +x where x is already number
export const n3 = +n;
