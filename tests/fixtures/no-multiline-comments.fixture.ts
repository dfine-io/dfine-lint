// no-multiline-comments — /** */ JSDoc blocks flagged (reported at the node they lead).

/** JSDoc block comment */
export const a = 1; // EXPECT: no-multiline-comments

// NEGATIVE: single-line comment
export const b = 2;

/* regular block comment (not JSDoc) */
export const c = 3;

// POSITIVE: a JSDoc block after a token on the same line, reported once
export const d = /** inline */ 4; // EXPECT: no-multiline-comments

// POSITIVE: a statement and its first child share one comment, which counts once
/** leads a function */
export function e() {} // EXPECT: no-multiline-comments
