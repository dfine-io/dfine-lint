// exhaustive-deps — useEffect/useCallback/useMemo must list all reactive deps.
import { useEffect, useState } from "react";
import * as React from "react";

declare function send(payload: { count: number }): void;

export function Comp(initial: number) {
  const [count, setCount] = useState(initial);

  // POSITIVE: 'count' read in the effect but missing from deps
  useEffect(() => {
    void count;
  }, []); // EXPECT: exhaustive-deps

  // POSITIVE: 'count' read through a shorthand property, missing from deps
  useEffect(() => {
    send({ count });
  }, []); // EXPECT: exhaustive-deps

  // NEGATIVE: deps complete
  useEffect(() => {
    void count;
  }, [count]);

  return [count, setCount] as const;
}

// NEGATIVE: a React.useState setter is stable through the namespace import too
export function NamespaceSetter() {
  const [, setValue] = React.useState(0);
  React.useEffect(() => {
    setValue(1);
  }, []);
}

// POSITIVE: a hook in an expression-bodied function reads its parameter
export const useDoubled = (n: number) => React.useMemo(() => n * 2, []); // EXPECT: exhaustive-deps

// NEGATIVE: a local useMemo lookalike takes no React dependency list
export function Lookalike(n: number) {
  const useMemo = (fn: () => number, deps: unknown[]) => fn() + deps.length;
  return useMemo(() => n * 2, []);
}
