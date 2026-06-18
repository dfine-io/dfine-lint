// restrict-plus-operands — string+number / bigint+non-bigint coercion in + flagged.
declare const s: string;
declare const n: number;
declare const big: bigint;

// POSITIVE: string + number
export const a = s + n; // EXPECT: restrict-plus-operands

// POSITIVE: bigint + number
export const b = big + n; // EXPECT: restrict-plus-operands

// NEGATIVE: number + number
export const c = n + n;

// NEGATIVE: string + string
export const d = s + s;
