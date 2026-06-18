// no-magic-numbers — bare numeric literals flagged; 0/1/-1/2, var-decl, property, return exempt.

// POSITIVE: magic number inside an expression
export function tax(price: number) {
  return price * 1.19; // EXPECT: no-magic-numbers
}

// POSITIVE: magic number as a call argument
export function schedule() {
  setTimeout(() => undefined, 5000); // EXPECT: no-magic-numbers
}

// NEGATIVE: ignored small numbers 0/1/-1/2
export const small = [0, 1, -1, 2];

// NEGATIVE: assigned to a named constant (var-decl exempt)
export const MAX_ITEMS = 500;

// NEGATIVE: object property value (property-assignment exempt)
export const config = { timeoutMs: 3000 };
