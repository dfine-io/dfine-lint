"use server";
// input-validation — exported SA with a user-constructible object param must call safeParse.
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
