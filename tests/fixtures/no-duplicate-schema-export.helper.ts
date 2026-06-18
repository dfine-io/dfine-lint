// Companion: re-declares an export named UserSchema → triggers the duplicate-schema check.
import { z } from "zod";

export const UserSchema = z.object({ name: z.string() });
