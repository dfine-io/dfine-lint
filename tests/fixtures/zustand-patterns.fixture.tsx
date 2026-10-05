// zustand-patterns — multi-field selector without useShallow + useShallow with a single field.
import { create as createStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

type State = { a: number; b: number };
// An aliased create still makes a zustand store
const useStore = createStore<State>()(() => ({ a: 1, b: 2 }));
// A Redux-style store also has a callable getState, but zustand does not declare it
type UseLookalike = { getState(): State } & (<T>(sel: (s: State) => T) => T);
declare const useLookalike: UseLookalike;

// POSITIVE: multi-field selector without useShallow
export function multi() {
  return useStore((s) => ({ a: s.a, b: s.b })); // EXPECT: zustand-patterns
}

// POSITIVE: useShallow wrapping a single-field object
export function single() {
  return useStore(useShallow((s) => ({ a: s.a }))); // EXPECT: zustand-patterns
}

// NEGATIVE: single-field direct selector
export function direct() {
  return useStore((s) => s.a);
}

// NEGATIVE: a multi-field selector on a store zustand did not create
export function lookalike() {
  return useLookalike((s) => ({ a: s.a, b: s.b }));
}
