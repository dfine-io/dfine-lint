// sdk-contract-probe: each EXPECT line is where the SDK helper must answer yes; every other marker call
// is a near miss that must stay silent.
import { useState, useState as useLocalState, type RefObject } from "react";
import { useFlag } from "./react/flags";
import { ambientCall, ambientValue } from "sdk-ambient-pkg";
import { storeExtra } from "./store";

// A relative augmentation extends project code: its declarations belong to no package
declare module "./store" {
  export function storeExtra(): void;
}

declare function branch(): boolean;
declare function lib(value: unknown): void;
declare function pkg(value: unknown, name: string): void;
declare function value(expr: unknown): void;
declare const cond: boolean;
declare const source: { target?: number };

export function branches() {
  if (cond) branch(); // EXPECT: sdk-contract-probe
  else branch(); // EXPECT: sdk-contract-probe
  if (branch()) void 0;
  const picked = cond ? branch() : branch(); // EXPECT: sdk-contract-probe // EXPECT: sdk-contract-probe
  const tested = branch() ? 1 : 2;
  if (cond) {
    const later = () => branch();
    void later;
  }
  return [picked, tested];
}

export function libs() {
  lib(RegExp); // EXPECT: sdk-contract-probe
  lib(CustomLib);
}

export function packages() {
  pkg(useState, "react"); // EXPECT: sdk-contract-probe
  pkg(useFlag, "react");
  pkg(ambientValue, "sdk-ambient-pkg"); // EXPECT: sdk-contract-probe
}

export function values() {
  let target: number | undefined = 0;
  const fallback = 1;
  value(({ target = fallback } = source)); // EXPECT: sdk-contract-probe
  return target;
}

declare function callee(call: unknown, spec: string): void;
declare function typePkg(value: unknown, name: string): void;
declare function error(value: unknown): void;
declare function db(call: unknown): void;
declare const ref: RefObject<number>;
declare const handle: { select(): unknown; insert(): unknown; update(): unknown; delete(): unknown };
declare const partial: { select(): unknown };
class AppError<T> extends Error {
  constructor(readonly detail: T) { super("app"); }
}
class NotAnError { readonly message = "no"; }
export default function defaultHelper(): number { return 1; }

export function identities() {
  callee(useLocalState(0), "react:useState"); // EXPECT: sdk-contract-probe
  callee(useLocalState(0), "project:useLocalState");
  callee(globalThis.fetch("/x"), "lib:fetch:global"); // EXPECT: sdk-contract-probe
  callee(ambientCall(), "sdk-ambient-pkg:ambientCall:sdk-ambient-pkg"); // EXPECT: sdk-contract-probe
  callee(defaultHelper(), "project:defaultHelper"); // EXPECT: sdk-contract-probe
  callee(storeExtra(), "project:storeExtra"); // EXPECT: sdk-contract-probe
  typePkg(ref, "react"); // EXPECT: sdk-contract-probe
  typePkg(source, "react");
  error(new AppError(1)); // EXPECT: sdk-contract-probe
  error(new NotAnError());
  db(handle.select()); // EXPECT: sdk-contract-probe
  db(partial.select());
}
