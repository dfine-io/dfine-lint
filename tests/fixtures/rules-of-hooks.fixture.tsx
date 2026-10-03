// rules-of-hooks — hooks must be top-level; not in conditions or after early returns. .tsx-only.
import React, { useState } from "react";
import { createStore, useStore } from "zustand";

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

// POSITIVE: a library hook (zustand's useStore) called conditionally
const store = createStore<{ n: number }>()(() => ({ n: 0 }));
export function ConditionalStore(cond: boolean) {
  if (cond) {
    const v = useStore(store); // EXPECT: rules-of-hooks
    return <div>{v.n}</div>;
  }
  return null;
}

// POSITIVE: an overloaded custom hook called conditionally
function useCounter(): number;
function useCounter(start: number): number;
function useCounter(start = 0): number {
  const [n] = useState(start);
  return n;
}
export function ConditionalOverload(cond: boolean) {
  if (cond) {
    const n = useCounter(); // EXPECT: rules-of-hooks
    return <div>{n}</div>;
  }
  return null;
}

void React;
