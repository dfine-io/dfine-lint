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

// NEGATIVE: strict equality
export const n1 = (n === 1);

// NEGATIVE: == null is exempt (nullish intent)
export const n2 = (s == null);

// NEGATIVE: +x where x is already number
export const n3 = +n;
