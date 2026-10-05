// react — nested-component, async-effect-no-cleanup (race), <button> without type.
import React, { useEffect, useState } from "react";

// POSITIVE: <button> without a type attribute
export function Btn() {
  return <button>Click</button>; // EXPECT: react
}

// POSITIVE: component defined inside render
export function Outer() {
  const Inner = () => { // EXPECT: react
    return <span />;
  };
  return (
    <div>
      <Inner />
    </div>
  );
}

// POSITIVE: async useEffect without a cleanup / abort guard
export function Race() {
  useEffect(async () => { // EXPECT: react
    await Promise.resolve();
  }, []);
}

// NEGATIVE: button with explicit type
export function OkBtn() {
  return <button type="button">Click</button>;
}

// NEGATIVE: an effect that syncs its dependency into state through a shorthand is guarded
export function Sync({ value }: { value: string }) {
  const [form, setForm] = useState({ value });
  useEffect(() => {
    setForm({ value });
  }, [value]);
  return form;
}

// POSITIVE: an effect sets a value it does not derive from its dependencies, with no condition
export function Reset({ id }: { id: string }) {
  const [facts, setFacts] = useState({ id: "", seen: false });
  useEffect(() => {
    setFacts({ id: "none", seen: false }); // EXPECT: react
  }, [id]);
  return facts;
}

// NEGATIVE: a setter behind an early return or inside an if branch is guarded by that condition
export function Guarded({ id, open }: { id: string; open: boolean }) {
  const [facts, setFacts] = useState({ seen: false });
  useEffect(() => {
    if (!open) return;
    setFacts({ seen: true });
  }, [id, open]);
  useEffect(() => {
    if (id) setFacts({ seen: false });
  }, [id]);
  useEffect(() => {
    open && setFacts({ seen: true });
  }, [open]);
  return facts;
}

// NEGATIVE: the lib's AbortController guards an async effect
export function Abortable() {
  useEffect(async () => {
    const ctrl = new AbortController();
    await Promise.resolve(ctrl);
  }, []);
}

// POSITIVE: a project class named AbortController is no abort guard
export function FakeAbort() {
  class AbortController { abort(): void {} }
  useEffect(async () => { // EXPECT: react
    const ctrl = new AbortController();
    await Promise.resolve(ctrl);
  }, []);
}

// NEGATIVE: a spread whose type requires `type` sets it
export function SpreadBtn(props: { type: "button" | "submit" }) {
  return <button {...props}>Click</button>;
}

// POSITIVE: a spread whose `type` is optional may leave it out
export function OptionalSpreadBtn(props: { type?: "button" }) {
  return <button {...props}>Click</button>; // EXPECT: react
}

void React;
