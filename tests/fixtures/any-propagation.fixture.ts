// any-propagation — flags any spreading via assignment / return / member-access / call.
const anyVal: any = 1;
const anyFn: any = () => 1;

// POSITIVE: var decl initialized from any-typed expr
export const a1 = anyVal; // EXPECT: any-propagation

// POSITIVE: member access on any-typed expr (any assignment and any member access)
export const a2 = anyVal.foo; // EXPECT: any-propagation // EXPECT: any-propagation

// POSITIVE: call on any-typed identifier (any assignment and any-typed call)
export const a3 = anyFn(); // EXPECT: any-propagation // EXPECT: any-propagation

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

// NEGATIVE: any lib receiver that returns any by design is exempt, not only JSON and Reflect.get
export const n6 = Reflect.apply(Math.max, undefined, [1, 2]);

// NEGATIVE: catch variable is exempt from any-assignment
export function n5(): string {
  try {
    return "ok";
  } catch (e) {
    const c = e;
    return typeof c === "string" ? c : "err";
  }
}
