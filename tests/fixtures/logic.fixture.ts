// logic — duplicate if/else-if condition, always-true branch, dead element write, dead init.
declare const flag: boolean;

export function dupCondition() {
  if (flag) return 1;
  else if (flag) return 2; // EXPECT: logic // EXPECT: logic
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

// NEGATIVE: the same property (one symbol, from one interface) on two receivers is two conditions
interface Flag {
  ok: boolean;
}
export function twoReceivers(a: Flag, b: Flag) {
  if (a.ok) return 1;
  else if (b.ok) return 2;
  return 0;
}

// POSITIVE: the same element of the same array, read through a reassigned index
export function elementReceiver(xs: Flag[], start: number) {
  let i = start;
  i += 1;
  if (xs[i]?.ok) return 1;
  else if (xs[i]?.ok) return 2; // EXPECT: logic
  return 0;
}

// NEGATIVE: the next statement writes another variable
export function otherVariable(v: number, y: number) {
  let x = v;
  y = 2;
  return x + y;
}

// NEGATIVE: another key or another array is another element
export function otherElements(xs: Flag[], ys: Flag[], i: number) {
  if (xs[0]?.ok) return 1;
  else if (xs[1]?.ok) return 2;
  if (xs[i]?.ok) return 3;
  else if (ys[i]?.ok) return 4;
  return 0;
}

// NEGATIVE: the overwrite reads the old value, through a shorthand or the same element
declare function wrap(o: { x: number }): number;
export function shorthandRead(v: number) {
  let x = v;
  x = wrap({ x });
  return x;
}
export function elementRead(arr: number[], v: number) {
  arr[0] = v;
  arr[0] = (arr[0] ?? 0) * 2;
  return arr;
}
export function receiverRead(arr: number[], v: number) {
  arr[0] = v;
  arr[0] = arr.reduce((s, x) => s + x, 0);
  return arr;
}

// POSITIVE: a[0], a["0"] and a[`0`] are one element
export function sameKeyText(arr: number[]) {
  arr[0] = 1; // EXPECT: logic
  arr["0"] = 2;
  return arr;
}
export function sameKeyTemplate(arr: number[]) {
  arr[`0`] = 1; // EXPECT: logic
  arr[0] = 2;
  return arr;
}

// NEGATIVE: distinct conditions, live writes
export function ok(x: number) {
  if (x > 0) return 1;
  return 0;
}
