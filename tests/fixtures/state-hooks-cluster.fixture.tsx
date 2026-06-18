// state-hooks-cluster — >=5 useState (cluster) + >=2 nullable useState in one function.
import { useState } from "react";

export function Cluster() {
  const [a, setA] = useState<string | null>(null); // EXPECT: state-hooks-cluster
  const [b, setB] = useState<number | null>(null);
  const [c] = useState(0);
  const [d] = useState(0);
  const [e] = useState(0);
  return { a, b, c, d, e, setA, setB };
}

// NEGATIVE: single state
export function Single() {
  const [x, setX] = useState(0);
  return { x, setX };
}
