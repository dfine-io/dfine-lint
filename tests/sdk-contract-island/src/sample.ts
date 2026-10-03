// sdk-contract-probe: each EXPECT line is where the SDK helper must answer yes; every other marker call
// is a near miss that must stay silent.
import { useState } from "react";
import { useFlag } from "./react/flags";
import { ambientValue } from "sdk-ambient-pkg";

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
  const picked = cond ? branch() : branch(); // EXPECT: sdk-contract-probe
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
