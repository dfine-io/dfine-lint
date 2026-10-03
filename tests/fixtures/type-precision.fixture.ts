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

// NEGATIVE: an element increment mutates the array
export function bump(a: number[]) {
  a[0]++;
  return a.length;
}

// NEGATIVE: Pick is already precise
export const okPick: Pick<T, "a"> = { a: 1 };

// NEGATIVE: the parameter is already readonly - inline, or through an alias of a readonly array
type Path = readonly string[];
type NestedPath = Path;
export function inlineReadonly(items: readonly number[]) {
  return items.length;
}
export function aliasedReadonly(path: Path) {
  return path.length;
}
export function nestedAliasReadonly(path: NestedPath) {
  return path.length;
}

// NEGATIVE: Readonly<T[]> and a generic alias also resolve to a readonly array
type ReadonlyList<E> = readonly E[];
export function mappedReadonly(items: Readonly<string[]>) {
  return items.length;
}
export function genericAliasReadonly(items: ReadonlyList<string>) {
  return items.length;
}

// POSITIVE: an alias of a mutable array still fires, so resolving aliases does not silence them all
type MutablePath = string[];
export function aliasedMutable(path: MutablePath) { // EXPECT: type-precision
  return path.length;
}
