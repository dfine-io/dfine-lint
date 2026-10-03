// performance — regex-in-loop, push-in-map, delete-on-array, long-chain, barrel-import.
// (sync-io omitted: needs node:fs — covered vs real code.)
import { barrelValue } from "./barrel"; // EXPECT: performance
import type { BarrelShape } from "./barrel"; // NEGATIVE: a type import is erased, nothing to tree-shake
declare const arr: number[];
export const fromBarrel: BarrelShape = { size: barrelValue };

export function regexInLoop(items: string[]) {
  for (const s of items) {
    new RegExp(s); // EXPECT: performance
  }
}

// NEGATIVE: the for-of iterable runs once, so its RegExp is built once
export function regexInHeader(text: string, pattern: string) {
  for (const m of text.match(new RegExp(pattern, "g")) ?? []) void m;
}

export function pushInMap() {
  const out: number[] = [];
  arr.map((x) => out.push(x)); // EXPECT: performance
}

export function deleteOnArray() {
  delete arr[0]; // EXPECT: performance
}

// long-chain uses LOCAL builder methods (Array methods resolve to lib → counted as
// third-party and exempt, so they cannot exercise this subcheck).
interface Builder {
  step(): Builder;
}
declare const b: Builder;
export const longChain = b.step().step().step().step().step().step().step(); // EXPECT: performance

// NEGATIVE: short chain
export const okChain = b.step().step();
void arr;
