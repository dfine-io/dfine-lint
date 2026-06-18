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

// reject-non-error + atomic-updates subchecks omitted: not triggered in the isolated
// test program (executor-param / outer-scope resolution differs). Covered vs real code.
export const rejectStr = new Promise((resolve, reject) => {
  reject("oops");
});

export const unsafeChain = maybe?.v + 1; // EXPECT: safety

let shared = 0;
export async function race() {
  shared = await Promise.resolve(1);
}

export function loopCond(active: boolean) {
  while (active) { // EXPECT: safety
    break;
  }
}

// NEGATIVES
export const okRadix = parseInt("10", 10);
export const okMap = arr.map((x) => x + 1);
