"use client";
// no-async-client-component — async exported components in a "use client" file.
import React from "react";

// POSITIVE: async function component
export async function Bad() { // EXPECT: no-async-client-component
  return <div />;
}

// POSITIVE: async arrow component
export const BadArrow = async () => <div />; // EXPECT: no-async-client-component

// NEGATIVE: sync component
export function Good() {
  return <div />;
}

// NEGATIVE: async non-component (returns a number, not JSX)
export async function fetchValue() {
  return 1;
}

void React;
