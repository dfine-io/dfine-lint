// fix-island input: tests/run.sh copies it to src/fix.ts, runs `dlint --fix` and compares with fix.expected.ts.
import { a, b } from "./util";
import * as self from "./fix";

function noop(): void {}
async function load(): Promise<number> {
  return 1;
}
function toPair(this: unknown, x: number): number[] {
  return [x, x];
}

// Removed whole: a debugger alone on its line, an unreachable call, a variable assigned to itself
export function debugAlone(): number {
  debugger;
  return a + b;
}
export function afterReturn(): number {
  return 1;
  noop();
}
export function selfAssign(): number {
  let n = 1;
  n = n;
  return n;
}

// Rewritten: the only body of an if becomes {}, a read of the last element becomes .at(-1), and
// flatMap keeps the thisArg
export function debugIf(flag: boolean): number {
  if (flag) debugger;
  return 1;
}
export const lastItem = (xs: number[]): number | undefined => xs[xs.length - 1];
export const pairs = (xs: number[], ctx: object): number[] => xs.map(toPair, ctx).flat();

// Left alone: each fix would change what the code does
export function floating(): void {
  load();
}
export function setLast(xs: number[]): void {
  xs[xs.length - 1] = 5;
}
export const half = (xs: number[]): number | undefined => xs[xs.length - 1.5];
export const callLast = (fns: Array<() => number>): number | undefined => fns[fns.length - 1]?.();
export function hoisted(): number {
  return 1;
  var late = 2;
}
export function setterSelfAssign(el: { scrollTop: number }): void {
  el.scrollTop = el.scrollTop;
}
export function swapFirst(): number {
  let first = 1;
  [first] = [2];
  return first;
}
export const parsed = (s: string): number => parseInt(s);
export const shown = (o: { v: number }): string => `value ${o}`;
export const ownProto = { ["__proto__"]: 1 };
export const selfRef = self;
