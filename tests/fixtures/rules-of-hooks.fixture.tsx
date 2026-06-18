// rules-of-hooks — hooks must be top-level; not in conditions or after early returns. .tsx-only.
import React, { useState } from "react";

// POSITIVE: hook inside a condition
export function Conditional(cond: boolean) {
  if (cond) {
    const [s] = useState(0); // EXPECT: rules-of-hooks
    return <div>{s}</div>;
  }
  return null;
}

// POSITIVE: hook after an early return
export function AfterReturn(cond: boolean) {
  if (cond) return null;
  const [s] = useState(0); // EXPECT: rules-of-hooks
  return <div>{s}</div>;
}

// NEGATIVE: top-level hook
export function Good() {
  const [s] = useState(0);
  return <div>{s}</div>;
}

void React;
