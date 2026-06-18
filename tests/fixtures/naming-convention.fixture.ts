// naming-convention — shadowing restricted names + label shadowing a variable.

// POSITIVE: parameter shadows restricted name 'NaN'
export function shadow(NaN: number) { // EXPECT: naming-convention
  return NaN;
}

// POSITIVE: label shadows a variable of the same name
export function labelShadow() {
  const dup = 1;
  dup: for (let i = 0; i < 1; i++) break dup; // EXPECT: naming-convention
  return dup;
}

// NEGATIVE: ordinary names
export function ok(value: number) {
  return value;
}
