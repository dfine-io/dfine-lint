// no-underscore-prefix — underscore-prefixed identifiers flagged; single '_' discard exempt.

// POSITIVE: underscore-prefixed variable
export const _internal = 1; // EXPECT: no-underscore-prefix

// POSITIVE: underscore-prefixed parameter
export function withParam(_unused: number) { // EXPECT: no-underscore-prefix
  return 1;
}

// NEGATIVE: single '_' discard (length < 2 → exempt)
export const _ = 1;

// NEGATIVE: semantic name
export const internalState = 2;
