// no-non-literal-require — require()/import() with a parameter-derived specifier loads attacker modules.

// POSITIVE: dynamic import() with a parameter specifier
export async function plugin(name: string) {
  return import(name); // EXPECT: no-non-literal-require
}

// POSITIVE: require() with a parameter specifier
export function load(mod: string) {
  return require(mod); // EXPECT: no-non-literal-require
}

// NEGATIVE: static import specifier (a real, resolvable module)
export async function staticImport() {
  return import("path");
}

// NEGATIVE: a local function named require is not the node require
function require2(p: string) {
  return p;
}
export function ok(x: string) {
  return require2(x);
}
