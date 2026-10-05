// cache-primitive-args — React.cache() args must be primitives (=== equality for dedup).
import { cache, cache as memo } from "react";

// POSITIVE: object argument (reference equality breaks cache)
export const c1 = cache((opts: { id: string }) => opts.id); // EXPECT: cache-primitive-args

// NEGATIVE: primitive (string) argument
export const c2 = cache((id: string) => id);

// POSITIVE: React.cache under an import alias
export const c3 = memo((opts: { id: string }) => opts.id); // EXPECT: cache-primitive-args

// NEGATIVE: a local function named cache is not React.cache
export function localCache() {
  const cache = <T,>(fn: T) => fn;
  return cache((opts: { id: string }) => opts.id);
}
