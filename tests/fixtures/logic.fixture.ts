// logic — duplicate if/else-if condition, always-true branch, dead element write, dead init.
declare const flag: boolean;

export function dupCondition() {
  if (flag) return 1;
  else if (flag) return 2; // EXPECT: logic
  return 0;
}

export function alwaysTrue() {
  if (true) return 1; // EXPECT: logic
  return 0;
}

export function deadWrite() {
  const out: number[] = [];
  out[0] = 1; // EXPECT: logic
  out[0] = 2;
  return out;
}

export function deadInit() {
  let v = 1; // EXPECT: logic
  v = 2;
  return v;
}

// NEGATIVE: distinct conditions, live writes
export function ok(x: number) {
  if (x > 0) return 1;
  return 0;
}
