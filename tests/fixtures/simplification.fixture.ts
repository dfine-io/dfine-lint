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

// NEGATIVE: super with an argument passes a value the default constructor would not
class Base {
  constructor(public label = "") {}
}
export class Named extends Base {
  constructor() {
    super("named");
  }
}

// NEGATIVE: a private constructor restricts who may construct the class
export class Singleton {
  private constructor() {}
  static create(): Singleton {
    return new Singleton();
  }
}

// POSITIVE: an empty object filled right after its declaration
export function filled() {
  const o: { a?: number } = {}; // EXPECT: simplification
  o.a = 1;
  return o;
}

// NEGATIVE: the return names another variable
export function returnsParam(other: number) {
  const unused = compute();
  return other;
}

// NEGATIVE: the next statement fills another object
export function others(other: { a?: number }) {
  const o: { a?: number } = {};
  other.a = 1;
  return [o, other] as const;
}

// NEGATIVE: no else, single return
export function clean(x: number) {
  if (x > 0) return 1;
  return 2;
}
