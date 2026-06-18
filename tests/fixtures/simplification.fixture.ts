// simplification — useless-else, collapsible-if, redundant-boolean, immediate-return, prefer-while, useless-ctor.
function compute() {
  return 1;
}

export function uselessElse(x: number) {
  if (x > 0) {
    return 1;
  } else { // EXPECT: simplification
    return 2;
  }
}

export function collapsible(a: boolean, b: boolean) {
  if (a) { // EXPECT: simplification
    if (b) {
      return 1;
    }
  }
  return 0;
}

export function boolReturn(x: boolean) {
  if (x) return true; // EXPECT: simplification
  return false;
}

export function immediate() {
  const result = compute(); // EXPECT: simplification
  return result;
}

export function whileLoop(cond: boolean) {
  for (; cond; ) { // EXPECT: simplification
    break;
  }
}

export class Empty {
  constructor() {} // EXPECT: simplification
}

// NEGATIVE: no else, single return
export function clean(x: number) {
  if (x > 0) return 1;
  return 2;
}
