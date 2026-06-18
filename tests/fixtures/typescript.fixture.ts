// typescript — catch-any, throw-string, double-assertion, inferrable, null-check,
// non-null-assertion, empty-interface, explicit-any (8 of 11 subchecks).
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

export const doubleAssert = u as any as number; // EXPECT: typescript

export const inferrable: number = num; // EXPECT: typescript

export const nullAccess = maybe.v; // EXPECT: typescript

export const nonNull = maybe!.v; // EXPECT: typescript

export interface EmptyShape {} // EXPECT: typescript

export const explicitAny: { value: any } = { value: 1 }; // EXPECT: typescript

// NEGATIVES
export const okStr = "hi";
export function okFn(): number {
  return 1;
}
