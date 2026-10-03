import { statSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import ignore from "ignore";

import { MAX_FILE_SIZE as DEFAULT_MAX_FILE_SIZE, GIT_MAX_BUFFER, GIT_TIMEOUT_MS, DLINT_IGNORE_FILE } from "./constants.js";
import type { CliOptions, DlintConfig } from "../types.js";
let maxFileSize = DEFAULT_MAX_FILE_SIZE;

function setMaxFileSize(size: number): void {
  maxFileSize = size;
}

// execFile (not exec): git runs with an argument array and no shell; a failed call throws, so the CLI exits 2
function gitExec(args: readonly string[], cwd: string): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const firstLine = String((err as { stderr?: unknown }).stderr ?? "").split("\n").find((l) => l.trim().length > 0);
    throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${firstLine?.trim() ?? (err as Error).message}`, { cause: err });
  }
}

// Paths from a -z git listing: NUL-separated, so quotes, tabs, spaces and non-ASCII names arrive verbatim
function gitFiles(args: readonly string[], cwd: string): string[] {
  return gitExec(args, cwd).split("\0").filter((f) => f.length > 0);
}

// Whether a revision exists: an unknown one prints nothing, a failure such as no repository throws
function gitHasRevision(rev: string, cwd: string): boolean {
  return gitExec(["rev-list", "-n1", "--ignore-missing", `${rev}^{commit}`, "--"], cwd).length > 0;
}

// Staged, unstaged and untracked files; before the first commit every tracked file counts as uncommitted
function uncommittedFiles(projectPath: string, hasHead: boolean): string[] {
  const changed = hasHead
    ? gitFiles(["diff", "-z", "--name-only", "--relative", "HEAD"], projectPath)
    : gitFiles(["ls-files", "-z", "--cached"], projectPath);
  return [...changed, ...gitFiles(["ls-files", "-z", "--others", "--exclude-standard"], projectPath)];
}

function filterByExtension(files: readonly string[], extensions: readonly string[]): string[] {
  const extSet = new Set(extensions);
  return files.filter((f) => extSet.has(extname(f)));
}

// A file that still exists and is not over the size limit; a deleted or unreadable one drops out
function withinSizeLimit(projectPath: string, f: string): boolean {
  try {
    return statSync(join(projectPath, f)).size <= maxFileSize;
  } catch {
    return false;
  }
}

function scanFiles(
  projectPath: string,
  extensions: readonly string[]
): string[] {
  return filterByExtension(gitFiles(["ls-files", "-z", "--cached", "--others", "--exclude-standard"], projectPath), extensions);
}

function scanChangedFiles(
  projectPath: string,
  extensions: readonly string[]
): string[] {
  return filterByExtension([...new Set(uncommittedFiles(projectPath, gitHasRevision("HEAD", projectPath)))].sort(), extensions);
}

function scanCommitFiles(
  projectPath: string,
  extensions: readonly string[]
): string[] {
  const hasHead = gitHasRevision("HEAD", projectPath);
  const files = new Set(uncommittedFiles(projectPath, hasHead));
  // The last commit against its parent; a root commit lists its own files, a shallow clone cannot know them
  if (gitHasRevision("HEAD~1", projectPath)) {
    for (const f of gitFiles(["diff", "-z", "--name-only", "--relative", "HEAD~1"], projectPath)) files.add(f);
  } else if (gitExec(["rev-parse", "--is-shallow-repository"], projectPath).trim() === "true") {
    throw new Error("--commit needs the parent of HEAD, but this clone is shallow: fetch with depth 2 or more");
  } else if (hasHead) {
    for (const f of gitFiles(["diff-tree", "-z", "--root", "-r", "--name-only", "--no-commit-id", "--relative", "HEAD"], projectPath)) files.add(f);
  }
  return filterByExtension([...files].sort(), extensions);
}

function scanBranchFiles(
  projectPath: string,
  extensions: readonly string[],
  baseBranch = "origin/main"
): string[] {
  // No leading dash (git would read an option) and no ".." (git would read a range)
  if (!/^[a-zA-Z0-9_.\/][a-zA-Z0-9\/_.\-]*$/.test(baseBranch) || baseBranch.includes("..")) {
    throw new Error(`Invalid base branch: ${baseBranch}`);
  }
  if (!gitHasRevision(baseBranch, projectPath)) {
    throw new Error(`base branch ${baseBranch} not found: fetch it (in CI: full history) or set baseBranch in dlint.config.ts`);
  }
  return filterByExtension(gitFiles(["diff", "-z", `${baseBranch}...HEAD`, "--name-only", "--relative"], projectPath), extensions);
}

function collectFilesFromDir(
  dir: string, extensions: readonly string[], projectPath: string, ig: ReturnType<typeof ignore>
): string[] {
  const result: string[] = [];
  function walk(d: string): void {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) {
        if (!ig.ignores(relative(projectPath, full) + "/")) walk(full);
      } else {
        result.push(relative(projectPath, full));
      }
    }
  }
  walk(dir);
  return filterByExtension(result, extensions);
}

function loadIgnorePatterns(projectPath: string): ReturnType<typeof ignore> {
  const ig = ignore();
  try { ig.add(readFileSync(join(projectPath, ".gitignore"), "utf-8")); } catch { /* no .gitignore */ }
  try { ig.add(readFileSync(join(projectPath, DLINT_IGNORE_FILE), "utf-8")); } catch { /* no .dlintignore */ }
  return ig;
}

// Files a run covers: explicit --files (directories expanded), a git selection, or the full scan
export function collectFiles(opts: CliOptions, config: DlintConfig): string[] {
  if (config.maxFileSize) setMaxFileSize(config.maxFileSize);
  const extensions = (config.include ?? ["**/*.ts", "**/*.tsx"])
    .map((p) => extname(p))
    .filter((e) => e.length > 1);
  if (extensions.length === 0) throw new Error(`include has no file pattern with an extension (e.g. "**/*.ts"): ${JSON.stringify(config.include)}`);
  const ig = loadIgnorePatterns(opts.path);
  if (config.exclude) for (const d of config.exclude) ig.add(d);
  const isExcluded = (f: string): boolean => ig.ignores(f);
  // A --files path, file or directory, is never size-filtered
  if (opts.files.length > 0) {
    const expanded: string[] = [];
    for (const f of opts.files) {
      const absPath = join(opts.path, f);
      if (!existsSync(absPath)) {
        throw new Error(`--files: "${f}" not found (a file or directory relative to ${opts.path})`);
      }
      if (statSync(absPath).isDirectory()) expanded.push(...collectFilesFromDir(absPath, extensions, opts.path, ig));
      else expanded.push(f);
    }
    return expanded.filter((f) => !isExcluded(f));
  }
  // Every git listing drops excluded, deleted and oversized files
  const keep = (f: string): boolean => !isExcluded(f) && withinSizeLimit(opts.path, f);
  if (opts.commit) return scanCommitFiles(opts.path, extensions).filter(keep);
  if (opts.branch) return scanBranchFiles(opts.path, extensions, config.baseBranch).filter(keep);
  if (opts.changed) return scanChangedFiles(opts.path, extensions).filter(keep);
  return scanFiles(opts.path, extensions).filter(keep);
}
