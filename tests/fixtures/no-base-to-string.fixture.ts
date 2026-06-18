// no-base-to-string — .toString() / string-concat on values without an own toString().

// POSITIVE: .toString() on a plain object (falls back to [object Object])
export const a = { x: 1 }.toString(); // EXPECT: no-base-to-string

// POSITIVE: plain object on the right of string concatenation
export const b = "val: " + { x: 1 }; // EXPECT: no-base-to-string

// NEGATIVE: number has an own toString
export const c = (42).toString();

// NEGATIVE: string + string
export const d = "a" + "b";
