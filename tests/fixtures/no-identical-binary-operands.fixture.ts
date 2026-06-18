// no-identical-binary-operands — both operands are the same pure value.
declare const a: number;
declare const c: number;
declare const b: boolean;
declare const obj: { x: number };
declare function f(): number;

export const r1 = a - a; // EXPECT: no-identical-binary-operands
export const r2 = a / a; // EXPECT: no-identical-binary-operands
export const r3 = b && b; // EXPECT: no-identical-binary-operands
export const r4 = a > a; // EXPECT: no-identical-binary-operands
export const r5 = obj.x | obj.x; // EXPECT: no-identical-binary-operands

// NEGATIVE: different operands, doubling/squaring ops, equality (handled elsewhere), side effects
export const ok1 = a - c;
export const ok2 = a + a;
export const ok3 = a * a;
export const ok4 = a === a;
export const ok5 = f() - f();
