// no-floating-promises — a Promise statement must be awaited / voided / assigned / .catch()-ed.
async function makePromise(): Promise<number> {
  return 1;
}

// POSITIVE: floating promise (result neither awaited nor handled)
export function bad() {
  makePromise(); // EXPECT: no-floating-promises
}

// NEGATIVE: awaited
export async function good1() {
  await makePromise();
}

// NEGATIVE: void-wrapped
export function good2() {
  void makePromise();
}

// NEGATIVE: .catch()-guarded
export function good3() {
  makePromise().catch(() => undefined);
}

// NEGATIVE: assigned (stored, not floating)
export function good4() {
  const p = makePromise();
  return p;
}
