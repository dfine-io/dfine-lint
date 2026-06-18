// syntactic-clone — 13-statement function duplicated near-identically in the helper (same dir).
export function computeReport(a: number, b: number) { // EXPECT: syntactic-clone
  const s1 = a + b;
  const s2 = a - b;
  const s3 = a * b;
  const s4 = a + 1;
  const s5 = s1 + s2;
  const s6 = s3 + s4;
  const s7 = s5 * s6;
  const s8 = s7 - s1;
  const s9 = s8 + s2;
  const s10 = s9 * s3;
  const s11 = s10 - s4;
  const s12 = s11 + s5;
  return s12;
}

// 11-statement clone of computeMidClone in the helper — caught at floor 10, MISSED at 12.
export function computeMid(x: number, y: number) { // EXPECT: syntactic-clone
  const a1 = x * y;
  const a2 = x + y;
  const a3 = a1 - a2;
  const a4 = a3 * x;
  const a5 = a4 + y;
  const a6 = a5 - a1;
  const a7 = a6 + a2;
  const a8 = a7 * a3;
  const a9 = a8 - a4;
  const a10 = a9 + a5;
  return a10;
}

// 8-statement clone of computeSmallClone — below the floor of 10, must NOT be flagged (FP guard).
export function computeSmall(p: number, q: number) {
  const b1 = p + q;
  const b2 = p - q;
  const b3 = b1 * b2;
  const b4 = b3 + p;
  const b5 = b4 - q;
  const b6 = b5 + b1;
  const b7 = b6 * b2;
  return b7;
}
