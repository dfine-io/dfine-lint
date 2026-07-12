// Linted by the ts7-alias island via the consumer rule ts7-engine-probe. The rule uses the
// TypeScript JS-API (ts.isDebuggerStatement) to flag this debugger statement — which only works
// if dlint's jiti alias resolved the consumer's bare `import ts from "typescript"` to dlint's
// bundled TS6 engine rather than the TS7-native stub staged in node_modules/.
export function probe(): number {
  debugger; // EXPECT: ts7-engine-probe
  return 1;
}
