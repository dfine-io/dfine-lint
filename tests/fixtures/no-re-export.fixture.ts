// no-re-export — re-exporting from another module is indirection; import directly.

// POSITIVE: named re-export with module specifier
export { isAbsolute } from "node:path"; // EXPECT: no-re-export

// POSITIVE: barrel (star) re-export
export * from "node:path"; // EXPECT: no-re-export

// NEGATIVE: local export (symbol declared in this file)
const localValue = 1;
export { localValue };
