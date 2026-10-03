// deprecated-usage — flags use of @deprecated symbols (calls, member access, identifiers).

/** @deprecated use freshFn instead */
function oldFn() {
  return 1;
}

function freshFn() {
  return 1;
}

// POSITIVE: calling a @deprecated function
export const d1 = oldFn(); // EXPECT: deprecated-usage

// NEGATIVE: calling a non-deprecated function
export const d2 = freshFn();

/** @deprecated use freshValue */
const oldValue = 1;
function use(v: number): number {
  return v;
}

// POSITIVE: a deprecated value passed as an argument
export const d3 = use(oldValue); // EXPECT: deprecated-usage

// POSITIVE: a deprecated value read through a shorthand property
export const viaShorthand = { oldValue }; // EXPECT: deprecated-usage

// NEGATIVE: a deprecated function may name itself through a shorthand
/** @deprecated use freshMake */
export function make(): unknown {
  return { make };
}

// POSITIVE: a deprecated lib member read without a call
export const d4 = "x".substr; // EXPECT: deprecated-usage

// NEGATIVE: a deprecated function may call itself
/** @deprecated use freshCount */
export function oldCount(n: number): number {
  return n > 0 ? oldCount(n - 1) : 0;
}

// NEGATIVE: a reference cannot pick an overload, and only one of them is deprecated
/** @deprecated pass a number */
function pick(v: string): number;
function pick(v: number): number;
function pick(v: string | number): number {
  return Number(v);
}
export const d5 = pick;
