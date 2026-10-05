// no-duplicate-schema-export — same-named exported Zod schema in two files (helper duplicates it).
import { z } from "zod";

export const UserSchema = z.object({ id: z.string() }); // EXPECT: no-duplicate-schema-export

// POSITIVE: .brand() and a type-guard .refine() return intersections that are still schemas
export const UserIdSchema = z.string().brand<"UserId">(); // EXPECT: no-duplicate-schema-export
export const EmailSchema = z.string().refine((s): s is `${string}@${string}` => s.includes("@")); // EXPECT: no-duplicate-schema-export

// NEGATIVE: uniquely-named schema
export const ProfileSchema = z.object({ bio: z.string() });

// NEGATIVE: a ZodError and a parse/safeParse lookalike share their names with the helper, but are no schemas
export const ParseFailure = new z.ZodError([]);
export const SettingsSchema = { parse: (x: unknown) => x, safeParse: (x: unknown) => ({ success: true, data: x }) };
