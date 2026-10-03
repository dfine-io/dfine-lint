import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import type { Diagnostic, TextChange } from "../types.js";

export interface FixResult {
  readonly file: string;
  readonly applied: number;
  readonly skipped: number;
}

export function applyFixes(
  diagnostics: readonly Diagnostic[],
  projectPath: string,
  dryRun: boolean
): FixResult[] {
  const fixesByFile = new Map<string, TextChange[][]>();

  for (const diag of diagnostics) {
    if (!diag.advisory?.fix) continue;
    const changes = Array.isArray(diag.advisory.fix)
      ? diag.advisory.fix
      : [diag.advisory.fix];
    if (changes.length === 0) continue;
    const existing = fixesByFile.get(diag.file) ?? [];
    existing.push(changes);
    fixesByFile.set(diag.file, existing);
  }

  const results: FixResult[] = [];
  const projectRoot = realpathSync(projectPath) + sep;

  for (const [file, fixes] of fixesByFile) {
    const absPath = realpathSync(join(projectPath, file));
    // A symlink may lead out of the project: never write there
    if (!absPath.startsWith(projectRoot)) {
      process.stderr.write(`dlint --fix: skipped ${file}, it resolves outside the project\n`);
      continue;
    }
    // A fix lands whole or not at all: bottom-up by its first change, skipped when it reaches an accepted one
    const firstStart = (fix: TextChange[]): number => Math.min(...fix.map((c) => c.start));
    const sorted = [...fixes].sort((a, b) => firstStart(b) - firstStart(a));
    const accepted: TextChange[] = [];
    let applied = 0;
    let minStart = Infinity;
    for (const fix of sorted) {
      if (Math.max(...fix.map((c) => c.start + c.length)) > minStart) continue;
      accepted.push(...[...fix].sort((a, b) => b.start - a.start));
      applied++;
      minStart = firstStart(fix);
    }

    if (!dryRun) {
      const text = readFileSync(absPath, "utf-8");
      // The program strips a byte order mark, so the offsets start after it
      const bom = text.charCodeAt(0) === 0xfeff ? text.slice(0, 1) : "";
      let content = text.slice(bom.length);
      for (const change of accepted) {
        content =
          content.slice(0, change.start) +
          change.newText +
          content.slice(change.start + change.length);
      }
      writeFileSync(absPath, bom + content);
    }

    results.push({
      file,
      applied,
      skipped: sorted.length - applied,
    });
  }

  return results;
}
