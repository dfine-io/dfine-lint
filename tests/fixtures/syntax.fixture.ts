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

export function useApply(fn: (...a: number[]) => void, args: number[]) {
  fn.apply(null, args); // EXPECT: syntax
}

// prefer-rest-params (arguments): omitted — `arguments` does not resolve to a
// FunctionScopedVariable symbol in the isolated test program, so the subcheck
// cannot be triggered here. Covered by the rule against real code.

export const power = Math.pow(2, 8); // EXPECT: syntax
export const bin = parseInt("1010", 2); // EXPECT: syntax
export const rx = new RegExp("abc"); // EXPECT: syntax

// NEGATIVES: const, template literal, ** operator, regex literal
export const okConst = 42;
export const okTemplate = `hi ${label}`;
export const okPower = 2 ** 8;
export const okRegex = /abc/;
