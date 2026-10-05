// safety — 9 subchecks: ctor-return, promise-executor-return, unsafe-optional-chain,
// async-promise-executor, atomic-updates, radix, unmodified-loop, reject-non-error, array-callback-return.
declare const arr: number[];
declare const maybe: { v: number } | null;

export class CtorReturn {
  constructor() {
    return {}; // EXPECT: safety
  }
}

export const radixMissing = parseInt("10"); // EXPECT: safety

export const noReturn = arr.map((x) => { x + 1; }); // EXPECT: safety

export const execReturn = new Promise((resolve) => {
  return 1; // EXPECT: safety
});

export const asyncExec = new Promise(async (resolve) => { // EXPECT: safety
  resolve(1);
});

// An expression-bodied async executor is async all the same
export const asyncExprExec = new Promise(async (resolve) => resolve(1)); // EXPECT: safety

// reject-non-error: the executor's second parameter, whatever it is called
export const rejectStr = new Promise((resolve, reject) => {
  reject("oops"); // EXPECT: safety
});
// A `this` parameter is a type annotation, not a position: fail is still the second parameter
export const rejectThis = new Promise(function (this: void, resolve, fail) {
  fail("oops"); // EXPECT: safety
});

export const unsafeChain = maybe?.v + 1; // EXPECT: safety

// require-atomic-updates: an outer variable read before the await and written after it
let shared = 0;
export async function race() {
  shared = shared + (await Promise.resolve(1)); // EXPECT: safety
}
export async function raceCompound() {
  shared += await Promise.resolve(1); // EXPECT: safety
}
export async function raceArgument(next: (n: number) => Promise<number>) {
  shared = await next(shared); // EXPECT: safety
}
// The read sits between two awaits: the second one still pauses before the write
export async function raceSecondAwait(next: (n: number) => Promise<number>) {
  shared = (await next(0)) + (await next(shared)); // EXPECT: safety
}

export function loopCond(active: boolean) {
  while (active) { // EXPECT: safety
    break;
  }
}

// A comparison reads the variable, it does not change it
export function loopCompare(running: boolean) {
  while (running) { // EXPECT: safety
    if (running === false) break;
  }
}

// !x reads the variable, it does not change it
export function loopNegate(running: boolean) {
  while (running) { // EXPECT: safety
    if (!running) break;
  }
}

// NEGATIVES
// Written through a shorthand pattern inside the loop
export function loopShorthand(running: boolean, next: () => { running: boolean }) {
  while (running) {
    ({ running } = next());
  }
}
// Written through destructuring inside the loop
export function loopDestructure(running: boolean, next: () => [boolean]) {
  while (running) {
    [running] = next();
  }
}
// A plain write reads nothing that could be stale
export async function plainWrite() {
  shared = await Promise.resolve(1);
}
// A read after the await sees the current value
export async function readAfterAwait() {
  shared = (await Promise.resolve(1)) + shared;
}
// A local variable is not shared with a concurrent call
export async function localUpdate() {
  let total = 0;
  total += await Promise.resolve(1);
  return total;
}
// An await inside a nested function does not pause the assignment
export function nestedAwait(run: (task: () => Promise<number>) => number) {
  shared = shared + run(async () => await Promise.resolve(1));
}
export const okRadix = parseInt("10", 10);
export const okMap = arr.map((x) => x + 1);
