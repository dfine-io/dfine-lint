"use strict";
"use server";
// input-validation — exported SA with a user-constructible object param must call safeParse.
// The "use strict" prologue ahead of "use server" checks that the whole directive prologue is read.
import { z } from "zod";

type Nested = { meta: { tag: string } };

// POSITIVE: object param (nested shape) without safeParse
export async function create(input: Nested) { // EXPECT: input-validation
  return input.meta.tag;
}

// NEGATIVE: same param validated via safeParse
const Schema = z.object({ meta: z.object({ tag: z.string() }) });
export async function createOk(input: Nested) {
  const result = Schema.safeParse(input);
  if (!result.success) return null;
  return result.data.meta.tag;
}

// NEGATIVE: primitive param (not user-constructible)
export async function byId(id: string) {
  return id;
}

// POSITIVE: a server action exported through an export list
async function listed(input: Nested) { // EXPECT: input-validation
  return input.meta.tag;
}
export { listed as listedAction };
