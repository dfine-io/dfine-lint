// no-child-process — exec()/execSync() with a parameter-derived command is command injection.
import { exec, execFile } from "child_process";
import { execSync } from "node:child_process";
import * as cp from "node:child_process";
import { exec as runShell } from "child_process";

// POSITIVE: command directly from a parameter (named import)
export function run(userCmd: string) {
  exec(userCmd); // EXPECT: no-child-process
}

// POSITIVE: node: import, parameter via string concatenation
export function archive(name: string) {
  execSync("tar czf out.tgz " + name); // EXPECT: no-child-process
}

// POSITIVE: namespace import member call
export function nsCall(cmd: string) {
  cp.exec(cmd); // EXPECT: no-child-process
}

// POSITIVE: deep taint — parameter flows through two variables
export function deep(input: string) {
  const a = input;
  const b = a;
  exec(b); // EXPECT: no-child-process
}

// POSITIVE: aliased import resolves to child_process.exec
export function aliased(cmd: string) {
  runShell(cmd); // EXPECT: no-child-process
}

// NEGATIVE: static command literal
export function listing() {
  exec("ls -la");
}

// NEGATIVE: execFile is not a shell method (safe argument-array form)
export function safe(file: string) {
  execFile(file, ["--version"]);
}

// NEGATIVE: a local function named exec is not child_process.exec
function exec3(s: string) {
  return s;
}
export function ok(x: string) {
  return exec3(x);
}
