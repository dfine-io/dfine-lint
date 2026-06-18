// no-static-inline-style — style={{}} with all-static values flagged. .tsx-only.
import React from "react";
declare const dynamicWidth: number;

// POSITIVE: all-static inline style
export const A = () => <div style={{ color: "red", padding: 4 }} />; // EXPECT: no-static-inline-style

// NEGATIVE: dynamic style value (computed at runtime)
export const B = () => <div style={{ width: dynamicWidth }} />;

void React;
