// any-propagation — flags any spreading via assignment / return / member-access / call.
const anyVal: any = 1;
const anyFn: any = () => 1;

// POSITIVE: var decl initialized from any-typed expr
export const a1 = anyVal; // EXPECT: any-propagation

// POSITIVE: member access on any-typed expr
export const a2 = anyVal.foo; // EXPECT: any-propagation

// POSITIVE: call on any-typed identifier
export const a3 = anyFn(); // EXPECT: any-propagation

// POSITIVE: return of any without an explicit function return type
export function a4() {
  return anyVal; // EXPECT: any-propagation
}

// NEGATIVE: JSON.parse is exempt (boundary)
export const n1 = JSON.parse("{}");

// NEGATIVE: explicit return type safely contains the any
export function n2(): any {
  return anyVal;
}

// NEGATIVE: typed value, not any
const typed = 1;
export const n3 = typed;

// NEGATIVE: Reflect.get is exempt (boundary)
export const n4 = Reflect.get({}, "x");

// NEGATIVE: catch variable is exempt from any-assignment
export function n5(): string {
  try {
    return "ok";
  } catch (e) {
    const c = e;
    return typeof c === "string" ? c : "err";
  }
}
