// deprecated-usage — flags use of @deprecated symbols (calls, member access, identifiers).

/** @deprecated use freshFn instead */
function oldFn() {
  return 1;
}

function freshFn() {
  return 1;
}

// POSITIVE: calling a @deprecated function
export const d1 = oldFn(); // EXPECT: deprecated-usage

// NEGATIVE: calling a non-deprecated function
export const d2 = freshFn();
