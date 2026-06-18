// no-implied-eval — string args to setTimeout/setInterval + new Function().

// POSITIVE: setTimeout with a string argument
export function t1() {
  setTimeout("doStuff()", 100); // EXPECT: no-implied-eval
}

// POSITIVE: setInterval with a string argument
export function t2() {
  setInterval("tick()", 100); // EXPECT: no-implied-eval
}

// POSITIVE: new Function() constructor
export const built = new Function("a", "return a"); // EXPECT: no-implied-eval

// NEGATIVE: setTimeout with a function argument
export function t3() {
  setTimeout(() => undefined, 100);
}

// POSITIVE: direct eval() with a parameter-derived string
export function t4(code: string) {
  return eval(code); // EXPECT: no-implied-eval
}

// NEGATIVE: a member access named eval on a local object is not the global eval
const sandbox = { eval: (n: number) => n };
export function t5(n: number) {
  return sandbox.eval(n);
}
