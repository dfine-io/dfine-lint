// no-useless-code — computed string key, literal concat, redundant .call(), {a:a} shorthand.
declare const a: number;
declare const o: { fn(x: number): void };

// POSITIVE: computed key with a string literal
export const obj1 = { ["key"]: 1 }; // EXPECT: no-useless-code

// POSITIVE: concatenation of two string literals
export const cat = "a" + "b"; // EXPECT: no-useless-code

// POSITIVE: redundant .call() where thisArg is the receiver
export function callRedundant() {
  o.fn.call(o, 1); // EXPECT: no-useless-code
}

// POSITIVE: {a: a} → shorthand
export const sh = { a: a }; // EXPECT: no-useless-code

// NEGATIVE: static key, real concat, shorthand already
export const okKey = { key: 1 };
export const okShort = { a };
// NEGATIVE: .call with another thisArg changes this
export function callOther(other: { fn(x: number): void }) {
  o.fn.call(other, 1);
}
// NEGATIVE: the computed key defines a plain member where the static one would not
export const ownProto = { ["__proto__"]: 1 };
export class Ctor {
  ["constructor"]() {}
}
