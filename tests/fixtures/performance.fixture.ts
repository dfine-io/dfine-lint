// performance — regex-in-loop, push-in-map, delete-on-array, long-chain.
// (sync-io + barrel-import omitted: need node:fs / an index module — covered vs real code.)
declare const arr: number[];

export function regexInLoop(items: string[]) {
  for (const s of items) {
    new RegExp(s); // EXPECT: performance
  }
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
