// no-multiline-comments — /** */ JSDoc blocks flagged (reported at the node they lead).

/** JSDoc block comment */
export const a = 1; // EXPECT: no-multiline-comments

// NEGATIVE: single-line comment
export const b = 2;

/* regular block comment (not JSDoc) */
export const c = 3;
