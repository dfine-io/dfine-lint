// prefer-modern-api — includes, no-delete, no-object-assign, flatMap, at, startsWith, hasOwn.
declare const arr: number[];
declare const str: string;
declare const obj: Record<string, number>;
declare const target: Record<string, number>;

export const a = arr.indexOf(5) !== -1; // EXPECT: prefer-modern-api
export function d() {
  delete obj.key; // EXPECT: prefer-modern-api
}
export const m = Object.assign({}, target); // EXPECT: prefer-modern-api
export const fm = arr.map((x) => [x]).flat(); // EXPECT: prefer-modern-api
export const last = arr[arr.length - 1]; // EXPECT: prefer-modern-api
export const sw = str.indexOf("p") === 0; // EXPECT: prefer-modern-api
export const ho = Object.prototype.hasOwnProperty.call(obj, "k"); // EXPECT: prefer-modern-api

declare const bytes: Int8Array;
export const lastByte = bytes[bytes.length - 1]; // EXPECT: prefer-modern-api
// A shorthand default value is read, so it may become .at()
export function defaultLast(o: { x?: number }) {
  let x: number | undefined = 0;
  ({ x = arr[arr.length - 1] } = o); // EXPECT: prefer-modern-api
  return x;
}

// NEGATIVES: already-modern forms
export const okIncludes = arr.includes(5);
export const okAt = arr.at(-1);
// NEGATIVES: .at() cannot be assigned to, IArguments has no .at(), arrays have no .startsWith(),
// and indexOf with a start index is no prefix test
export function setLast() {
  arr[arr.length - 1] = 5;
}
export function lastArg() {
  return arguments[arguments.length - 1];
}
export const arrStarts = arr.indexOf(5) === 0;
export const fromIndex = str.indexOf("p", 1) === 0;
