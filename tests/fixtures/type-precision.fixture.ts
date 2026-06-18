// type-precision — partial-to-pick, record-known-keys, index-signature, redundant-typeof,
// redundant-nullcheck, prefer-satisfies, no-string-literal-union, prefer-readonly.
type T = { a: number; b: number; c: number };
type Cfg = { x: number; y: number };
declare const s: string;
declare const n: number;

export const partial: Partial<T> = { a: 1 }; // EXPECT: type-precision

export const rec: Record<string, number> = { x: 1, y: 2 }; // EXPECT: type-precision

export interface Conf { // EXPECT: type-precision
  [key: string]: unknown;
  name: string;
}

export const redundantTypeof = typeof s === "string"; // EXPECT: type-precision

export const redundantNull = n !== null; // EXPECT: type-precision

export const cfg: Cfg = { x: 1, y: 2 }; // EXPECT: type-precision

export function stringUnion(mode: "a" | "b") { // EXPECT: type-precision
  return mode;
}

export function readonlyArr(items: number[]) { // EXPECT: type-precision
  return items.length;
}

// NEGATIVE: Pick is already precise
export const okPick: Pick<T, "a"> = { a: 1 };
