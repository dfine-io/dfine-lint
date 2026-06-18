// no-non-literal-regexp — RegExp from a parameter-derived pattern is a ReDoS/injection surface.

// POSITIVE: pattern directly from a function parameter
export function make(p: string) {
  return new RegExp(p); // EXPECT: no-non-literal-regexp
}

// POSITIVE: call form, parameter flows through a variable
export function find(input: string) {
  const pat = input;
  return RegExp(pat); // EXPECT: no-non-literal-regexp
}

// POSITIVE: parameter inside a string concatenation
export function wrap(frag: string) {
  return new RegExp("^" + frag + "$"); // EXPECT: no-non-literal-regexp
}

// NEGATIVE: static string-literal pattern
export function isDigits(s: string) {
  return new RegExp("^[0-9]+$").test(s);
}

// NEGATIVE: regex literal (not the RegExp constructor)
export function hasAt(s: string) {
  return /.+@.+/.test(s);
}

// NEGATIVE: pattern from a module-level constant (not parameter-derived)
const STATIC = "^abc$";
export function constPattern() {
  return new RegExp(STATIC);
}
