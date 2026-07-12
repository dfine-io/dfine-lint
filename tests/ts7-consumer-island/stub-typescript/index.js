// Test stub simulating a TS7-native `typescript`: the package no longer exposes the in-process
// JS API (createProgram / getTypeChecker / SyntaxKind / isX are gone; the entry only re-exports a
// version). A consumer rule that imports bare `typescript` and calls ts.isDebuggerStatement against
// this would throw (undefined is not a function) — unless dlint's jiti alias pins its own bundled
// TS6 engine. tests/run.sh stages this into node_modules/typescript before the ts7-alias run.
module.exports = { version: "7.0.2" };
