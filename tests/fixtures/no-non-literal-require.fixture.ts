// no-non-literal-require — require()/import() with a parameter-derived specifier loads attacker modules.
import { createRequire } from "node:module";
const localRequire = createRequire(import.meta.url);

// POSITIVE: a createRequire() result is Node's require as well
export function loadVia(mod: string) {
  return localRequire(mod); // EXPECT: no-non-literal-require
}

// NEGATIVE: a local binding named require is not Node's require
export function shadowed(mod: string) {
  const require = (m: string) => m;
  return require(mod);
}

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
