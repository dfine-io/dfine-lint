// no-all-duplicated-branches — every branch/clause identical.
function doIt(n: number): number {
  return n * 2;
}

export function chain(v: number) {
  if (v === 1) { return doIt(v); } // EXPECT: no-all-duplicated-branches
  else if (v === 2) { return doIt(v); }
  else { return doIt(v); }
}

export function twoBranch(v: number) {
  if (v > 0) { return doIt(v); } // EXPECT: no-all-duplicated-branches
  else { return doIt(v); }
}

export function sw(v: number) {
  switch (v) { // EXPECT: no-all-duplicated-branches
    case 1: return doIt(v);
    case 2: return doIt(v);
    default: return doIt(v);
  }
}

// NEGATIVE: branches differ / no final else / switch default differs
export function okChain(v: number) {
  if (v === 1) return doIt(v);
  else if (v === 2) return doIt(v + 1);
  else return 0;
}
export function okNoElse(v: number) {
  if (v === 1) { return doIt(v); }
  else if (v === 2) { return doIt(v); }
  return 0;
}
export function okSwitch(v: number) {
  switch (v) {
    case 1: return doIt(v);
    default: return 0;
  }
}
