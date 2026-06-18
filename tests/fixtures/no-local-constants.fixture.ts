// no-local-constants — UPPER_SNAKE primitive constants outside constants/ must be centralized.

// POSITIVE: UPPER_SNAKE local constant with a non-trivial value
export const API_TIMEOUT = 5000; // EXPECT: no-local-constants

// NEGATIVE: camelCase (not a constant by convention)
export const apiTimeout = 5000;

// NEGATIVE: trivial value
export const ZERO = 0;

// NEGATIVE: empty string sentinel
export const EMPTY = "";
