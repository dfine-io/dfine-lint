// no-empty-function — empty bodies flagged; abstract/ctor/callback/zero-param-arrow/commented exempt.

// POSITIVE: empty function declaration
export function emptyFn() {} // EXPECT: no-empty-function

// POSITIVE: empty class method
export class WithMethod {
  doThing() {} // EXPECT: no-empty-function
}

// POSITIVE: non-zero-param arrow with empty body (boundary: param>0 → not exempt)
export const withParam = (x: number) => {}; // EXPECT: no-empty-function

// NEGATIVE: empty body WITH explanatory comment
export function documented() {
  // intentionally a no-op
}

// NEGATIVE: empty arrow as callback argument (exempt)
[1].forEach(() => {});

// NEGATIVE: empty constructor (exempt)
export class WithCtor {
  constructor() {}
}

// NEGATIVE: zero-param arrow assigned to a variable (exempt)
export const noop = () => {};
