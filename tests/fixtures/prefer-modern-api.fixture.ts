// prefer-modern-api — includes, no-delete, no-object-assign, flatMap, at, startsWith, hasOwn, zod validate.
import { z } from "zod";
declare const arr: number[];
declare const str: string;
declare const obj: Record<string, number>;
declare const target: Record<string, number>;

export const a = arr.indexOf(5) !== -1; // EXPECT: prefer-modern-api
export function d() {
  delete obj.key; // EXPECT: prefer-modern-api
}
export const m = Object.assign({}, target); // EXPECT: prefer-modern-api
export const fm = arr.map((x) => [x]).flat(); // EXPECT: prefer-modern-api
export const last = arr[arr.length - 1]; // EXPECT: prefer-modern-api
export const sw = str.indexOf("p") === 0; // EXPECT: prefer-modern-api
export const ho = Object.prototype.hasOwnProperty.call(obj, "k"); // EXPECT: prefer-modern-api

declare const bytes: Int8Array;
export const lastByte = bytes[bytes.length - 1]; // EXPECT: prefer-modern-api
// A shorthand default value is read, so it may become .at()
export function defaultLast(o: { x?: number }) {
  let x: number | undefined = 0;
  ({ x = arr[arr.length - 1] } = o); // EXPECT: prefer-modern-api
  return x;
}

// NEGATIVES: already-modern forms
export const okIncludes = arr.includes(5);
export const okAt = arr.at(-1);
// NEGATIVES: .at() cannot be assigned to, IArguments has no .at(), arrays have no .startsWith(),
// and indexOf with a start index is no prefix test
export function setLast() {
  arr[arr.length - 1] = 5;
}
export function lastArg() {
  return arguments[arguments.length - 1];
}
export const arrStarts = arr.indexOf(5) === 0;
export const fromIndex = str.indexOf("p", 1) === 0;
// NEGATIVE: a receiver with indexOf but no lib includes() has nothing to switch to
declare const queue: { indexOf(x: number): number };
export const inQueue = queue.indexOf(5) !== -1;

// zod-validate: only .success of a safeParse is read, and the schema offers validate()
const Tag = z.string().min(1);
export const isTag = (input: unknown) => Tag.safeParse(input).success; // EXPECT: prefer-modern-api
export const isTagAsync = async (input: unknown) => (await Tag.safeParseAsync(input)).success; // EXPECT: prefer-modern-api
// NEGATIVES: the parsed data is read, and a lookalike safeParse has no validate() to switch to
export function readTag(input: unknown) {
  const result = Tag.safeParse(input);
  return result.success ? result.data : "";
}
declare const lookalike: { safeParse(x: unknown): { success: boolean } };
export const isLookalike = (input: unknown) => lookalike.safeParse(input).success;
