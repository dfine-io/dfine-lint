// cache-primitive-args — React.cache() args must be primitives (=== equality for dedup).
import { cache } from "react";

// POSITIVE: object argument (reference equality breaks cache)
export const c1 = cache((opts: { id: string }) => opts.id); // EXPECT: cache-primitive-args

// NEGATIVE: primitive (string) argument
export const c2 = cache((id: string) => id);
