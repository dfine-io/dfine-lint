// restrict-template-expr — only primitives / own-toString allowed in `${}`.
declare const obj: { a: number };
declare const n: number;

// POSITIVE: plain object interpolated
export const a = `value: ${obj}`; // EXPECT: restrict-template-expr

// NEGATIVE: number is safe
export const b = `count: ${n}`;
