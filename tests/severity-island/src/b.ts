// severity-island: a typescript:no-explicit-any finding, an untagged typescript finding, a third statement
export const b = (x: any) => x;
export function fail(): never { throw "b"; }
export const third = 3;
