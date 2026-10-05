// banned-syntax — void, labels, lone-blocks, multi-str, delete-var, global-assign.

// POSITIVE: void expression
export const v = void 0; // EXPECT: banned-syntax

// POSITIVE: labeled statement
export function labeled() {
  outer: for (let i = 0; i < 1; i++) { // EXPECT: banned-syntax
    if (i === 0) break outer;
  }
}

// POSITIVE: lone (nested) block
export function lone() {
  { // EXPECT: banned-syntax
    const x = 1;
    return x;
  }
}

// POSITIVE: delete on a variable identifier
export function del() {
  let dv = 1;
  delete dv; // EXPECT: banned-syntax
  delete NaN; // EXPECT: banned-syntax
  delete (NaN); // EXPECT: banned-syntax
  delete ((NaN)); // EXPECT: banned-syntax
}

// POSITIVE: reassignment of a global (lib) binding
export function glob() {
  NaN = 1; // EXPECT: banned-syntax
  NaN += 1; // EXPECT: banned-syntax
  NaN++; // EXPECT: banned-syntax
  [NaN] = [1]; // EXPECT: banned-syntax
  ({ NaN } = { NaN: 1 }); // EXPECT: banned-syntax
}

// NEGATIVE: reading a global is no write
export const readNaN = NaN;

// NEGATIVE: undefined used directly (no void)
export const ok1 = undefined;
// NEGATIVE: delete on object property (allowed)
export function okDel() {
  const o: { a?: number } = { a: 1 };
  delete o.a;
}
