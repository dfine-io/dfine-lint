// unnecessary-type-assertion — `as T` where expr is already T (bidirectionally assignable).
declare const s: string;
declare const u: unknown;
declare const w: string | number;

// POSITIVE: redundant assertion (already string)
export const a = s as string; // EXPECT: unnecessary-type-assertion

// NEGATIVE: as const
export const b = { x: 1 } as const;

// NEGATIVE: unknown narrowed (not bidirectional)
export const c = u as string;

// NEGATIVE: legit narrowing (string|number → string, not bidirectional)
export const d = w as string;
