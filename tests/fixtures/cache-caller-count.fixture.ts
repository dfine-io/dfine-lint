// cache-caller-count — React.cache() wrapper must have >= 2 callers, else no dedup benefit.
import { cache } from "react";

// POSITIVE: cache() wrapper with 0 callers (< 2)
export const loadOnce = cache((id: string) => id); // EXPECT: cache-caller-count

// NEGATIVE: cache() wrapper with 2 callers
const loadTwice = cache((id: string) => id);
export const u1 = loadTwice("a");
export const u2 = loadTwice("b");
