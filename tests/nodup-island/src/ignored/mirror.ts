import { z } from "zod";

// Under the ignored path. ignorePaths: ["ignored/"] drops this file from the duplicate scan,
// so its Shared copy must NOT make keep.ts's Shared a duplicate.
export const Shared = z.object({ b: z.string() });
