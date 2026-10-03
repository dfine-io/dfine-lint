// prefer-nullish-coalescing — || on a nullable value flagged; boolean context / boolean type skipped.
declare const maybe: string | null;
declare const flag: boolean;

// POSITIVE: || fallback on a nullable value
export const a = maybe || "default"; // EXPECT: prefer-nullish-coalescing

// NEGATIVE: || in boolean context (if condition) — intentional truthiness
export function f() {
  if (maybe || flag) return 1;
  return 0;
}

// NEGATIVE: || on a boolean type
export const b = flag || true;

// POSITIVE: || on a type parameter whose constraint includes null
export function genericNullable<T extends string | null>(x: T) {
  return x || "default"; // EXPECT: prefer-nullish-coalescing
}

// NEGATIVE: || on a type parameter constrained to boolean | null keeps its truthiness meaning
export function genericBoolean<B extends boolean | null>(flagValue: B) {
  return flagValue || false;
}
