// Companion: re-declares an export named UserSchema → triggers the duplicate-schema check.
import { z } from "zod";

export const UserSchema = z.object({ name: z.string() });
export const UserIdSchema = z.string().brand<"UserId">();
export const EmailSchema = z.string().refine((s): s is `${string}@${string}` => s.includes("@"));

// Same names as the fixture's non-schemas: a ZodError and a parse/safeParse lookalike
export const ParseFailure = new z.ZodError([]);
export const SettingsSchema = { parse: (x: unknown) => x, safeParse: (x: unknown) => ({ success: true, data: x }) };
