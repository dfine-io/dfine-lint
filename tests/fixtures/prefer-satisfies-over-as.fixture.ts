// Fixture: prefer-satisfies-over-as — self-contained (no domain imports).
// EXPECT: <ruleId> on a line = MUST be flagged. Unmarked = MUST NOT flag.

type Config = { a: number; b?: string };

// POSITIVE: object literal `as T` (widens — not bidirectionally assignable)
export const c1 = { a: 1 } as Config; // EXPECT: prefer-satisfies-over-as

// POSITIVE: array literal `as T`
export const c2 = [{ a: 1 }] as Config[]; // EXPECT: prefer-satisfies-over-as

// NEGATIVE: satisfies (not an as-expression)
export const n1 = { a: 1 } satisfies Config;

// NEGATIVE: as const (skipped)
export const n2 = { a: 1 } as const;

// NEGATIVE: as unknown (boundary, skipped)
export const n3 = { a: 1 } as unknown;

// NEGATIVE: non-literal expression (call result, not object/array literal)
export const n4 = JSON.parse("{}") as Config;
