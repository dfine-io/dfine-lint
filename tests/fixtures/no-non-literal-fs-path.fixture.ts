// no-non-literal-fs-path — fs path API with a parameter-derived path is a traversal surface.
import * as fs from "node:fs";
import { readFileSync } from "fs";
import { readFile as readFileP } from "fs/promises";
import { writeFileSync as wfs } from "fs";

// POSITIVE: namespace import, path directly from a parameter
export function load(name: string) {
  return fs.readFile(name, () => undefined); // EXPECT: no-non-literal-fs-path
}

// POSITIVE: named import, path via concatenation
export function read(rel: string) {
  return readFileSync("/data/" + rel); // EXPECT: no-non-literal-fs-path
}

// POSITIVE: fs/promises path from a parameter
export function readP(p: string) {
  return readFileP(p); // EXPECT: no-non-literal-fs-path
}

// POSITIVE: aliased writeFileSync resolves to fs.writeFileSync
export function write(name: string, data: string) {
  return wfs(name, data); // EXPECT: no-non-literal-fs-path
}

// NEGATIVE: static path literal
export function config() {
  return readFileSync("/etc/app/config.json");
}

// NEGATIVE: a local function named readFile is not fs.readFile
function readFile2(p: string) {
  return p;
}
export function ok(p: string) {
  return readFile2(p);
}
