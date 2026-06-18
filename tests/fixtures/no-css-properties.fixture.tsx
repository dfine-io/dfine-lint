// no-css-properties — CSSProperties type annotations / satisfies flagged. .tsx-only.
import type { CSSProperties } from "react";

// POSITIVE: CSSProperties type annotation
export const styled: CSSProperties = { color: "red" }; // EXPECT: no-css-properties

// POSITIVE: satisfies CSSProperties
export const more = { color: "blue" } satisfies CSSProperties; // EXPECT: no-css-properties

// NEGATIVE: plain object, no CSSProperties type
export const plain = { color: "green" };
