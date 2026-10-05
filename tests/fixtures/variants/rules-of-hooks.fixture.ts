// rules-of-hooks — the rules hold in .ts files too: custom hooks live there.
import { useState } from "react";

// POSITIVE: a hook in a condition inside a .ts custom hook
export function useMaybe(cond: boolean): number {
  const [base] = useState(1);
  if (cond) {
    const [n] = useState(0); // EXPECT: rules-of-hooks
    return n + base;
  }
  return base;
}
