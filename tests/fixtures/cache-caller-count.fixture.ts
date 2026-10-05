// cache-caller-count — React.cache() wrapper must have >= 2 callers, else no dedup benefit.
import { cache } from "react";
import * as here from "./cache-caller-count.fixture";

// POSITIVE: cache() wrapper with 0 callers (< 2)
export const loadOnce = cache((id: string) => id); // EXPECT: cache-caller-count

// NEGATIVE: cache() wrapper with 2 callers
const loadTwice = cache((id: string) => id);
export const u1 = loadTwice("a");
export const u2 = loadTwice("b");

// NEGATIVE: a direct call and a call through a namespace import are two callers
export const loadMixed = cache((id: string) => id);
export const u3 = loadMixed("a");
export const u4 = here.loadMixed("b");

// NEGATIVE: a local function named cache is not React.cache
export function localCache() {
  const cache = (fn: (id: string) => string) => fn;
  const once = cache((id) => id);
  return once;
}
