// no-deprecated-api — __proto__ access, arguments.callee, extending a native prototype.
declare const obj: { x: number };

// POSITIVE: __proto__ access
export const proto = obj.__proto__; // EXPECT: no-deprecated-api

// NEGATIVE: ordinary property access
export const ok = obj.x;

// POSITIVE: arguments.callee
export function selfRef() {
  return arguments.callee; // EXPECT: no-deprecated-api
}

// POSITIVE: a method assigned onto a native prototype, one level below .prototype
Array.prototype.last = function () { return this[this.length - 1]; }; // EXPECT: no-deprecated-api

// POSITIVE: replacing the whole prototype
declare const replacement: Map<string, number>;
Map.prototype = replacement; // EXPECT: no-deprecated-api

// NEGATIVE: a member the DOM lib declares, stubbed where the environment lacks it (a polyfill, a test double)
Element.prototype.scrollIntoView = () => undefined;

// NEGATIVE: foo.constructor is a project value, no lib constructor
declare const foo: { constructor: { prototype: { x?: number } } };
foo.constructor.prototype.x = 1;
