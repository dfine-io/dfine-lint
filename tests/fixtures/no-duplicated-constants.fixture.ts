// no-duplicated-constants — local const duplicating a central */constants/* export (name + value).
const MAX_RETRIES = 5; // EXPECT: no-duplicated-constants
export const usesMax = MAX_RETRIES;

// NEGATIVE: unique value, no central match
const UNIQUE_LIMIT = 987;
export const usesUnique = UNIQUE_LIMIT;
