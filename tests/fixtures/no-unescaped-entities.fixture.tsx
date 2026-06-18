// no-unescaped-entities — bare > " ' } in JSX text flagged. .tsx-only.
import React from "react";

// POSITIVE: unescaped '>' in JSX text
export const A = () => <div>5 > 3 is true</div>; // EXPECT: no-unescaped-entities

// NEGATIVE: clean text
export const B = () => <div>five is greater than three</div>;

void React;
