// no-duplicated-constants — local const duplicating a central */constants/* export (name + value).
const MAX_RETRIES = 5; // EXPECT: no-duplicated-constants
export const usesMax = MAX_RETRIES;
const PAGE_SIZE = 25; // EXPECT: no-duplicated-constants
export const usesPageSize = PAGE_SIZE;

// NEGATIVE: unique value, no central match
const UNIQUE_LIMIT = 987;
export const usesUnique = UNIQUE_LIMIT;
