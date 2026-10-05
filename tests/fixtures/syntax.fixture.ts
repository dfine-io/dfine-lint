// syntax — 8 modern-JS subchecks: no-var, prefer-const, prefer-template, prefer-spread,
// prefer-rest-params, prefer-exponentiation, prefer-numeric-literals, prefer-regex-literals.
declare const label: string;

export function useVar() {
  var legacy = 1; // EXPECT: syntax
  return legacy;
}

export function useLet() {
  let fixed = 1; // EXPECT: syntax
  return fixed;
}

export const greeting = "hi " + label; // EXPECT: syntax
declare const shout: Uppercase<string>;
export const loud = shout + 1; // EXPECT: syntax
declare const pick: "a" | "b";
export const picked = pick + 1; // EXPECT: syntax
declare const id: `id-${string}`;
export const idPlus = id + 1; // EXPECT: syntax

export function useApply(fn: (...a: number[]) => void, args: number[]) {
  fn.apply(null, args); // EXPECT: syntax
}

// prefer-rest-params: the built-in arguments object
export function useArguments() {
  return arguments.length; // EXPECT: syntax
}

// NEGATIVE: a property or destructured key named arguments is no arguments object
export function readArgumentsKey(record: Record<"arguments", number>) {
  const { arguments: count } = record;
  return record.arguments + count;
}

export const power = Math.pow(2, 8); // EXPECT: syntax
export const bin = parseInt("1010", 2); // EXPECT: syntax
export const binNum = Number.parseInt("1010", 2); // EXPECT: syntax
export const rx = new RegExp("abc"); // EXPECT: syntax
export const rxGlobal = new globalThis.RegExp("abc"); // EXPECT: syntax

export function onlyNegated() {
  let flag = true; // EXPECT: syntax
  return !flag;
}

// NEGATIVE: written through destructuring, so it cannot be const
export function destructured() {
  let first = 1;
  [first] = [2];
  return first;
}

// NEGATIVES: const, template literal, ** operator, regex literal
export const okConst = 42;
export const okTemplate = `hi ${label}`;
export const okPower = 2 ** 8;
export const okRegex = /abc/;
