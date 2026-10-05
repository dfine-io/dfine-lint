// typescript — catch-any, throw-string, double-assertion, inferrable, null-check,
// non-null-assertion, empty-interface, explicit-any, unsafe-index (9 of 11 subchecks).
declare const maybe: { v: number } | null;
declare const num: number;
declare const u: unknown;

export function catchAny() {
  try {
    JSON.parse("{}");
  } catch (e: any) { // EXPECT: typescript
    void e;
  }
}

export function throwStr(): never {
  throw "boom"; // EXPECT: typescript
}
export function throwMapped(code: Uppercase<string>): never {
  throw code; // EXPECT: typescript
}

// Double assertion and the explicit any inside it are two findings
export const doubleAssert = u as any as number; // EXPECT: typescript // EXPECT: typescript

export const inferrable: number = num; // EXPECT: typescript

export const nullAccess = maybe.v; // EXPECT: typescript

export const nonNull = maybe!.v; // EXPECT: typescript

export interface EmptyShape {} // EXPECT: typescript

export const explicitAny: { value: any } = { value: 1 }; // EXPECT: typescript

export const shadowName = 1;
export function shadows(): number {
  const shadowName = 2; // EXPECT: typescript
  return shadowName;
}

// POSITIVE: a key the object does not declare may index into undefined
declare const shape: { a: number; b: number };
declare const shapeKey: "a" | "c";
export const missingKey = shape[shapeKey]; // EXPECT: typescript

// NEGATIVES
// Every key the index can take names a declared property
declare const knownKey: "a" | "b";
export const knownValue = shape[knownKey];
// A sibling function's local is not in the enclosing scope, so reusing its name shadows nothing
export function siblingA(): number {
  const local = 1;
  return local;
}
export function siblingB(): number {
  const local = 2;
  return local;
}
export const okStr = "hi";
export function okFn(): number {
  return 1;
}
