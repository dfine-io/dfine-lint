// no-duplicate-schema-export — same-named exported Zod schema in two files (helper duplicates it).
import { z } from "zod";

export const UserSchema = z.object({ id: z.string() }); // EXPECT: no-duplicate-schema-export

// NEGATIVE: uniquely-named schema
export const ProfileSchema = z.object({ bio: z.string() });
