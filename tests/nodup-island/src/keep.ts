import { z } from "zod";

// Twin is also exported by keep2.ts (both scanned) -> a real in-program duplicate, must fire.
export const Twin = z.object({ a: z.string() }); // EXPECT: no-duplicate-schema-export

// Shared is also exported by ignored/mirror.ts, but ruleOptions.ignorePaths excludes "ignored/",
// so the mirror copy is dropped from the scan and Shared is NOT a duplicate here -> must stay silent.
export const Shared = z.object({ b: z.string() });
