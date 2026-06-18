// complexity — params>4, depth>4, callbacks>3, cyclomatic>15, statements>25. (lines>150 omitted — bloat)

// POSITIVE: too many parameters (5 > 4)
export function tooManyParams(a: number, b: number, c: number, d: number, e: number) { // EXPECT: complexity
  return a + b + c + d + e;
}

// POSITIVE: nesting depth 5 > 4
export function tooDeep(x: number) { // EXPECT: complexity
  if (x > 0) {
    if (x > 1) {
      if (x > 2) {
        if (x > 3) {
          if (x > 4) return x;
        }
      }
    }
  }
  return 0;
}

// POSITIVE: callback depth 4 > 3
export function tooManyCallbacks() { // EXPECT: complexity
  [1].forEach(() => { [2].forEach(() => { [3].forEach(() => { [4].forEach(() => undefined); }); }); });
}

// POSITIVE: cyclomatic 17 > 15 (16 logical-or branches)
export function tooComplex(n: number) { // EXPECT: complexity
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5 || n === 6 || n === 7 || n === 8 || n === 9 || n === 10 || n === 11 || n === 12 || n === 13 || n === 14 || n === 15 || n === 16;
}

// POSITIVE: 26 statements > 25
export function tooManyStatements() { // EXPECT: complexity
  const s1 = 1; const s2 = 1; const s3 = 1; const s4 = 1; const s5 = 1;
  const s6 = 1; const s7 = 1; const s8 = 1; const s9 = 1; const s10 = 1;
  const s11 = 1; const s12 = 1; const s13 = 1; const s14 = 1; const s15 = 1;
  const s16 = 1; const s17 = 1; const s18 = 1; const s19 = 1; const s20 = 1;
  const s21 = 1; const s22 = 1; const s23 = 1; const s24 = 1; const s25 = 1;
  const s26 = 1;
  return s1 + s26;
}

// NEGATIVE: simple function under all thresholds
export function simple(a: number) {
  return a + 1;
}
