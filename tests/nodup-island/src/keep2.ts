import { z } from "zod";

// Non-ignored second copy of Twin -> makes Twin a real duplicate (proves the rule still fires
// when ignorePaths is set).
export const Twin = z.object({ a: z.string() });
