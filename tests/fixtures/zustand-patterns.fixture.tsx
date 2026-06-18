// zustand-patterns — multi-field selector without useShallow + useShallow with a single field.
import { useShallow } from "zustand/react/shallow";

type State = { a: number; b: number };
type UseStore = { getState(): State } & (<T>(sel: (s: State) => T) => T);
declare const useStore: UseStore;

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
