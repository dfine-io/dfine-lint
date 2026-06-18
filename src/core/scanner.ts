import { statSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import ignore from "ignore";

import { MAX_FILE_SIZE as DEFAULT_MAX_FILE_SIZE, GIT_MAX_BUFFER, GIT_TIMEOUT_MS, DLINT_IGNORE_FILE } from "./constants.js";
let maxFileSize = DEFAULT_MAX_FILE_SIZE;

export function setMaxFileSize(size: number): void {
  maxFileSize = size;
}

// execFile (not exec) — git runs with an argument array, no shell, so file names and the
// validated base branch can never be shell-injected. stderr is dropped; a non-zero git exit
// (e.g. HEAD~1 in a single-commit repo) is caught and yields an empty file list.
function gitExec(args: readonly string[], cwd: string): string[] {
  try {
    const output = execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  } catch {
    return [];
  }
}

function filterByExtension(files: readonly string[], extensions: readonly string[]): string[] {
  const extSet = new Set(extensions);
  return files.filter((f) => extSet.has(`.${f.split(".").pop() ?? ""}`));
}

export function scanFiles(
  projectPath: string,
  extensions: readonly string[],
  excludeDirs?: string[]
): string[] {
  const ig = loadIgnorePatterns(projectPath);
  if (excludeDirs) for (const d of excludeDirs) ig.add(d);
  const raw = gitExec(
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    projectPath
  );
  return filterByExtension(raw, extensions).filter((f) => {
    if (ig.ignores(f)) return false;
    try {
      return statSync(join(projectPath, f)).size <= maxFileSize;
    } catch {
      return false;
    }
  });
}

export function scanChangedFiles(
  projectPath: string,
  extensions: readonly string[]
): string[] {
  const files = new Set<string>();
  // Uncommitted (staged + unstaged)
  for (const f of gitExec(["diff", "--name-only", "HEAD"], projectPath)) {
    files.add(f);
  }
  // Untracked
  for (const f of gitExec(
    ["ls-files", "--others", "--exclude-standard"],
    projectPath
  )) {
    files.add(f);
  }
  return filterByExtension([...files].sort(), extensions);
}

export function scanCommitFiles(
  projectPath: string,
  extensions: readonly string[]
): string[] {
  const files = new Set<string>();
  // Last commit
  for (const f of gitExec(["diff", "HEAD~1", "--name-only"], projectPath)) {
    files.add(f);
  }
  // Uncommitted (staged + unstaged)
  for (const f of gitExec(["diff", "--name-only", "HEAD"], projectPath)) {
    files.add(f);
  }
  // Untracked
  for (const f of gitExec(
    ["ls-files", "--others", "--exclude-standard"],
    projectPath
  )) {
    files.add(f);
  }
  return filterByExtension([...files].sort(), extensions);
}

export function scanBranchFiles(
  projectPath: string,
  extensions: readonly string[],
  baseBranch = "origin/main"
): string[] {
  if (!/^[a-zA-Z0-9\/_.\-]+$/.test(baseBranch)) {
    throw new Error(`Invalid base branch: ${baseBranch}`);
  }
  const raw = gitExec(
    ["diff", `${baseBranch}...HEAD`, "--name-only"],
    projectPath
  );
  return filterByExtension(raw, extensions).filter((f) => {
    try { return existsSync(join(projectPath, f)); } catch { return false; }
  });
}

export function collectFilesFromDir(
  dir: string, extensions: readonly string[], projectPath: string, ig: ReturnType<typeof ignore>
): string[] {
  const result: string[] = [];
  const extSet = new Set(extensions);
  function walk(d: string): void {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) {
        if (!ig.ignores(relative(projectPath, full) + "/")) walk(full);
      } else if (extSet.has(`.${entry.split(".").pop() ?? ""}`)) {
        result.push(relative(projectPath, full));
      }
    }
  }
  walk(dir);
  return result;
}

export function loadIgnorePatterns(projectPath: string): ReturnType<typeof ignore> {
  const ig = ignore();
  try { ig.add(readFileSync(join(projectPath, ".gitignore"), "utf-8")); } catch { /* no .gitignore */ }
  try { ig.add(readFileSync(join(projectPath, DLINT_IGNORE_FILE), "utf-8")); } catch { /* no .dlintignore */ }
  return ig;
}
