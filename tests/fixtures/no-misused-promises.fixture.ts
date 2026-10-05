// no-misused-promises — async callback in a void-expecting position (useEffect / contextual void).
import { useEffect } from "react";
import * as React from "react";

declare function onClick(handler: () => void): void;
declare function run(handler: () => Promise<void>): void;

// POSITIVE: async useEffect callback
export function inEffect() {
  useEffect(async () => undefined, []); // EXPECT: no-misused-promises
}

// POSITIVE: async callback where contextual type expects void
export function inHandler() {
  onClick(async () => undefined); // EXPECT: no-misused-promises
}

// NEGATIVE: async callback where Promise return is expected
export function okPromise() {
  run(async () => undefined);
}

// POSITIVE: React.useEffect through the namespace import
export function inNamespaceEffect() {
  React.useEffect(async () => undefined, []); // EXPECT: no-misused-promises
}

// NEGATIVE: a local useEffect that expects a promise is not React's
export function localEffect() {
  const useEffect = (cb: () => Promise<void>, deps: unknown[]) => void [cb, deps];
  useEffect(async () => undefined, []);
}
