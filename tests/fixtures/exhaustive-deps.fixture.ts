// exhaustive-deps — useEffect/useCallback/useMemo must list all reactive deps.
import { useEffect, useState } from "react";

export function Comp(initial: number) {
  const [count, setCount] = useState(initial);

  // POSITIVE: 'count' read in the effect but missing from deps
  useEffect(() => {
    void count;
  }, []); // EXPECT: exhaustive-deps

  // NEGATIVE: deps complete
  useEffect(() => {
    void count;
  }, [count]);

  return [count, setCount] as const;
}
