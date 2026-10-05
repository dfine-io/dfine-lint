// performance — regex-in-loop, sync-io, push-in-map, delete-on-array, long-chain, barrel-import.
import { barrelValue } from "./barrel"; // EXPECT: performance
import type { BarrelShape } from "./barrel"; // NEGATIVE: a type import is erased, nothing to tree-shake
import { localValue } from "./no-re-export.fixture"; // NEGATIVE: a file that re-exports and declares code is no barrel
import { barrelValue as byName } from "./barrel/reexports"; // EXPECT: performance
import { barrelValue as byAlias } from "@fixtures/barrel/reexports"; // EXPECT: performance
import { readFileSync as readSync } from "node:fs";
declare const arr: number[];
export const fromBarrel: BarrelShape = { size: barrelValue + localValue + byName + byAlias };

// sync-io: an aliased fs import still blocks the event loop
export const config = readSync("config.json", "utf8"); // EXPECT: performance

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

// NEGATIVE: push() on a project queue is no array mutation
declare const queue: { push(x: number): void };
export const queued = arr.map((x) => queue.push(x));

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
