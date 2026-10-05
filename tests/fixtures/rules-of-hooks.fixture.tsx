// rules-of-hooks — hooks must be top-level; not in conditions or after early returns. .tsx-only.
import React, { useState } from "react";
import { createStore, useStore } from "zustand";
import { use } from "hooks-lookalike";

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

// POSITIVE: a hook inside a .map callback runs once per item; the hook call alone makes no hook
export function List({ items }: { items: string[] }) {
  const labels = items.map((item) => {
    const [label] = useState(item); // EXPECT: rules-of-hooks
    return label;
  });
  return <ul>{labels.map((l) => <li key={l}>{l}</li>)}</ul>;
}

// NEGATIVE: react's use() may run in a condition
export function Reader({ cond, data }: { cond: boolean; data: Promise<string> }) {
  const text = cond ? React.use(data) : "";
  return <p>{text}</p>;
}

// NEGATIVE: react's use() may also run in an if, a loop and after an early return
export function ReaderIf({ cond, data }: { cond: boolean; data: Promise<string> }) {
  if (cond) {
    return <p>{React.use(data)}</p>;
  }
  return null;
}
export function ReaderLoop({ all }: { all: Promise<string>[] }) {
  const texts: string[] = [];
  for (const one of all) texts.push(React.use(one));
  return <p>{texts.join(",")}</p>;
}
export function ReaderAfterReturn({ skip, data }: { skip: boolean; data: Promise<string> }) {
  if (skip) return null;
  return <p>{React.use(data)}</p>;
}

// POSITIVE: a component that renders nothing, with its only hook call in a condition
export function Analytics({ enabled }: { enabled: boolean }): null {
  if (enabled) {
    const [n] = useState(0); // EXPECT: rules-of-hooks
    void n;
  }
  return null;
}

// POSITIVE: a PascalCase arrow inside a component is a callback, not a component of its own
export function Clicker() {
  const Handle = () => {
    const [v] = useState(0); // EXPECT: rules-of-hooks
    return v;
  };
  return <button type="button" onClick={Handle}>x</button>;
}

// POSITIVE: a component a higher-order function returns is still a component
export function withTracking() {
  return function Tracker({ on }: { on: boolean }): null {
    if (on) useState(0); // EXPECT: rules-of-hooks
    return null;
  };
}

// NEGATIVE: a component declared inside a test callback calls its hook at its own top level
declare function it(name: string, fn: () => void): void;
it("renders", () => {
  function Probe(): null {
    const [n] = useState(0);
    void n;
    return null;
  }
  void Probe;
});

// POSITIVES: a hook in a loop, a switch case, a ternary branch, a short-circuit operand, at module level
export function Looper({ items }: { items: number[] }): null {
  for (const item of items) {
    const [s] = useState(item); // EXPECT: rules-of-hooks
    void s;
  }
  return null;
}
export function Switcher({ mode }: { mode: number }): null {
  switch (mode) {
    case 1: {
      const [s] = useState(0); // EXPECT: rules-of-hooks
      void s;
    }
  }
  return null;
}
export function Ternary({ on }: { on: boolean }) {
  const v = on ? useState(0)[0] : 0; // EXPECT: rules-of-hooks
  return <p>{v}</p>;
}
export function ShortCircuit({ on }: { on: boolean }) {
  const v = on && useState(0)[0]; // EXPECT: rules-of-hooks
  return <p>{String(v)}</p>;
}
export const moduleState = useState(0); // EXPECT: rules-of-hooks

// POSITIVE: a hook inside a method of an object a component builds is a callback
export function Panel() {
  const [n] = useState(0);
  const api = {
    read() {
      return useState(1)[0]; // EXPECT: rules-of-hooks
    },
  };
  return <div>{n + api.read()}</div>;
}

// POSITIVES: a class member is no function component, even a render() that returns JSX
export class ClassCounter extends React.Component {
  constructor(props: object) {
    super(props);
    useState(0); // EXPECT: rules-of-hooks
  }
  get label(): number {
    return useState(1)[0]; // EXPECT: rules-of-hooks
  }
  render() {
    const [n] = useState(2); // EXPECT: rules-of-hooks
    return <p>{n}</p>;
  }
}

// NEGATIVES: returns inside a nested function or a method sit above a top-level hook, and `return useX()` itself
export function NestedReturns() {
  const double = (x: number) => {
    return x * 2;
  };
  const handlers = { submit() { return false; } };
  class Box { constructor() { return; } get size() { return 1; } }
  const [s] = useState(double(new Box().size));
  return <form onSubmit={handlers.submit}>{s}</form>;
}
export function useWrapped(): number {
  return useState(0)[0];
}

// NEGATIVE: another package's use() is no React hook, even inside try
export function OtherUse() {
  try {
    use(1);
  } catch {
    return null;
  }
  return null;
}

// POSITIVE: an arrow named like a hook through its variable is a hook
export const useCounterVar = (skip: boolean): number => {
  if (skip) return 0;
  const [n] = useState(0); // EXPECT: rules-of-hooks
  return n;
};

// POSITIVE: a named custom hook whose only hook call runs after an early return
export function useMaybeCount(skip: boolean): number {
  if (skip) return 0;
  const [n] = useState(0); // EXPECT: rules-of-hooks
  return n;
}

// POSITIVE: react's use() inside try/catch
export function TryReader({ data }: { data: Promise<string> }) {
  try {
    return <p>{React.use(data)}</p>; // EXPECT: rules-of-hooks
  } catch {
    return null;
  }
}

// POSITIVE: a default-exported custom hook keeps its name and is still a hook
export default function useDefaultCounter(): number {
  const [n] = useState(0);
  return n;
}
export function ConditionalDefault(cond: boolean) {
  if (cond) return <div>{useDefaultCounter()}</div>; // EXPECT: rules-of-hooks
  return null;
}

void React;
