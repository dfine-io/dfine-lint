// jsx-no-useless-fragment — <>singleElement</> flagged; expression/multi-child exempt. .tsx-only.
import React from "react";
declare const x: number;

// POSITIVE: fragment wrapping a single element
export const A = () => <><span /></>; // EXPECT: jsx-no-useless-fragment

// NEGATIVE: fragment around an expression (may be needed for typing)
export const B = () => <>{x}</>;

// NEGATIVE: fragment with multiple children
export const C = () => <><span /><span /></>;

void React;
