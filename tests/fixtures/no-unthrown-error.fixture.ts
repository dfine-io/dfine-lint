// no-unthrown-error — Error constructed as a bare statement, never thrown.
class MyError extends Error {}

export function bad(x: number) {
  if (x < 0) {
    new Error("negative"); // EXPECT: no-unthrown-error
  }
  return x;
}

export function bad2() {
  new MyError(); // EXPECT: no-unthrown-error
}

// NEGATIVE: thrown / assigned / returned / passed / non-Error
export function ok1(x: number) {
  if (x < 0) throw new Error("negative");
  return x;
}
export function ok2() {
  const e = new Error("kept");
  return e;
}
export function ok3() {
  return new Error("returned");
}
export function ok4(log: (e: Error) => void) {
  log(new Error("passed"));
}
export function ok5() {
  new Date(); // not an Error
}
