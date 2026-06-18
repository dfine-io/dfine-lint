// no-debug-code — debugger statements must not ship.

// POSITIVE: debugger statement
export function withDebugger(x: number) {
  debugger; // EXPECT: no-debug-code
  return x;
}

// NEGATIVE: no debug code
export function clean(x: number) {
  return x + 1;
}
