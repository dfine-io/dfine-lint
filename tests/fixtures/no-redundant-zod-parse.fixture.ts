// no-redundant-zod-parse — parsing a value already branded to the schema output. Not "use server".
import { z } from "zod";

const FileIdSchema = z.string().brand<"FileId">();
type FileId = z.infer<typeof FileIdSchema>;

declare const alreadyBranded: FileId;
declare const raw: string;

// POSITIVE: re-parsing an already-branded value
export const redundant = FileIdSchema.parse(alreadyBranded); // EXPECT: no-redundant-zod-parse

// NEGATIVE: parsing a raw string (legit trust-boundary parse)
export const boundary = FileIdSchema.parse(raw);

// NEGATIVE: safeParse of an already-branded value — never flagged. Choosing safeParse is inherently
// defensive (caller handles success:false), so it is always a validation boundary (e.g. a JSONB /
// $type() DB column whose runtime value is not guaranteed despite the static type).
export const safe = FileIdSchema.safeParse(alreadyBranded);

// POSITIVE: a union schema's parse is zod's parse as well
const MaybeFileIdSchema = z.union([FileIdSchema, z.null()]);
declare const maybeBranded: FileId | null;
export const redundantUnion = MaybeFileIdSchema.parse(maybeBranded); // EXPECT: no-redundant-zod-parse

// NEGATIVE: z.parse(schema, value) is zod's exported function, not the schema member
export const viaFunction = z.parse(FileIdSchema, alreadyBranded);

// NEGATIVE: a lookalike with parse and safeParse is no zod schema
declare const lookalike: { parse(x: unknown): FileId; safeParse(x: unknown): unknown };
export const notZod = lookalike.parse(alreadyBranded);
