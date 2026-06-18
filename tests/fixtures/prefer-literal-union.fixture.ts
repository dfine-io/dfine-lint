// prefer-literal-union — plain-string === 'literal' → narrow source; union/branded/empty exempt.
declare const status: string;
declare const kind: "a" | "b";

// POSITIVE: plain string compared to a string literal
export const a = status === "active"; // EXPECT: prefer-literal-union

// NEGATIVE: operand is already a literal union
export const b = kind === "a";

// NEGATIVE: empty-string sentinel check
export const c = status === "";
