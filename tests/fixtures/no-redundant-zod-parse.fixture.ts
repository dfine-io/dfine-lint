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
