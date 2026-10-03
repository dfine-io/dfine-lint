// prefer-literal-union — plain-string === 'literal' → narrow source; union/branded/empty exempt.
declare const status: string;
declare const kind: "a" | "b";

// POSITIVE: plain string compared to a string literal
export const a = status === "active"; // EXPECT: prefer-literal-union

// NEGATIVE: operand is already a literal union
export const b = kind === "a";

// NEGATIVE: the compared property feeds a literal-union parameter, so the guard narrows it
declare function setMode(mode: "a" | "b"): void;
export function apply(obj: { status: string }) {
  if (obj.status === "a") setMode(obj.status);
}

// NEGATIVE: the compared property is returned from a literal-union function, so the guard narrows it
export function pick(obj: { status: string }): "a" | "b" {
  if (obj.status === "a") return obj.status;
  return "b";
}

// NEGATIVE: empty-string sentinel check
export const c = status === "";
