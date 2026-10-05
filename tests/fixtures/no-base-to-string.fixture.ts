// no-base-to-string — .toString() / string-concat on values without an own toString().

// POSITIVE: .toString() on a plain object (falls back to [object Object])
export const a = { x: 1 }.toString(); // EXPECT: no-base-to-string

// POSITIVE: plain object on the right of string concatenation
export const b = "val: " + { x: 1 }; // EXPECT: no-base-to-string

// POSITIVE: a template literal type is a string too
declare const id: `id-${string}`;
export const e = id + { x: 1 }; // EXPECT: no-base-to-string

// POSITIVE: a string literal union is a string too
declare const pick: "a" | "b";
export const g = pick + { x: 1 }; // EXPECT: no-base-to-string

// POSITIVE: the object on the left of a string, or of a literal union
export const h = { x: 1 } + "s"; // EXPECT: no-base-to-string
export const i = { x: 1 } + pick; // EXPECT: no-base-to-string

// NEGATIVE: an intrinsic string mapping is a string on both sides
declare const u: Uppercase<string>;
declare const v: Uppercase<string>;
export const f = u + v;

// NEGATIVE: number has an own toString
export const c = (42).toString();

// NEGATIVE: string + string
export const d = "a" + "b";

// POSITIVE: a function prints its source, never a value
declare const handler: () => void;
export const j = "fn: " + handler; // EXPECT: no-base-to-string

// NEGATIVE: a tuple prints its elements; an Error subclass prints name and message
declare const pair: [number, number];
export const k = "pair: " + pair;
class AppError extends Error {}
export const l = "err: " + new AppError("x");
