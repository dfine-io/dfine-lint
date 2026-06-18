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

// NEGATIVES: already-modern forms
export const okIncludes = arr.includes(5);
export const okAt = arr.at(-1);
