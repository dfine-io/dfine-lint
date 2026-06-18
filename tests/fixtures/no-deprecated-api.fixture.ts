// no-deprecated-api — __proto__ access.
// Omitted subchecks (not synthesizable in the isolated test program; covered vs real code):
//  - arguments.caller/callee: `arguments` doesn't resolve to FunctionScopedVariable here.
//  - extend-native: needs a 2-level `X.Y.prototype = ...` with a lib-recognized receiver.
declare const obj: { x: number };

// POSITIVE: __proto__ access
export const proto = obj.__proto__; // EXPECT: no-deprecated-api

// NEGATIVE: ordinary property access
export const ok = obj.x;
