// state-hooks-cluster — >=5 useState (cluster) + >=2 nullable useState in one function.
import { useRef, useState } from "react";
import * as React from "react";

export function Cluster() {
  const [a, setA] = useState<string | null>(null); // EXPECT: state-hooks-cluster // EXPECT: state-hooks-cluster
  const [b, setB] = useState<number | null>(null);
  const [c] = useState(0);
  const [d] = useState(0);
  const [e] = useState(0);
  return { a, b, c, d, e, setA, setB };
}

// POSITIVE: a boolean state and a ref counter written in one callback
export function Busy() {
  const [busy, setBusy] = useState(false); // EXPECT: state-hooks-cluster
  const count = useRef(0);
  const start = () => {
    setBusy(true);
    count.current++;
  };
  return { busy, start };
}

// POSITIVE: React.useState through the namespace import counts like the named import
export function NamespaceStates() {
  const [a] = React.useState<string | null>(null); // EXPECT: state-hooks-cluster
  const [b] = React.useState<number | null>(null);
  return { a, b };
}

// POSITIVE: a status union written together with nullable data in one callback
type Phase = "idle" | "loading" | "done";
export function Loader(load: () => Promise<{ rows: number[] }>) {
  const [phase, setPhase] = useState<Phase>("idle"); // EXPECT: state-hooks-cluster
  const [data, setData] = useState<{ rows: number[] } | null>(null);
  const run = async () => {
    setPhase("loading");
    const result = await load();
    setData(result);
    setPhase("done");
  };
  return { phase, data, run };
}

// POSITIVE: status and data written together in a nested function declaration
export function LoaderFn(load: () => Promise<{ rows: number[] }>) {
  const [phase, setPhase] = useState<Phase>("idle"); // EXPECT: state-hooks-cluster
  const [data, setData] = useState<{ rows: number[] } | null>(null);
  async function run() {
    setPhase("loading");
    setData(await load());
    setPhase("done");
  }
  return { phase, data, run };
}

// NEGATIVE: a view selector is never written together with the data beside it
export function Tabs(load: () => Promise<{ rows: number[] }>) {
  const [tab, setTab] = useState<"list" | "chart">("list");
  const [data, setData] = useState<{ rows: number[] } | null>(null);
  const refresh = async () => {
    setData(await load());
  };
  return { tab, setTab, data, refresh };
}

// NEGATIVE: single state
export function Single() {
  const [x, setX] = useState(0);
  return { x, setX };
}
