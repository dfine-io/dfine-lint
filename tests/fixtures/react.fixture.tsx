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

void React;
