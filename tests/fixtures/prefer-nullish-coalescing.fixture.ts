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
