import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  const fixesByFile = new Map<string, TextChange[]>();

  for (const diag of diagnostics) {
    if (!diag.advisory?.fix) continue;
    const changes = Array.isArray(diag.advisory.fix)
      ? diag.advisory.fix
      : [diag.advisory.fix];
    const existing = fixesByFile.get(diag.file) ?? [];
    existing.push(...changes);
    fixesByFile.set(diag.file, existing);
  }

  const results: FixResult[] = [];

  for (const [file, changes] of fixesByFile) {
    // Sort descending by start position (bottom-to-top application)
    const sorted = [...changes].sort((a, b) => b.start - a.start);

    // Overlap guard: skip changes that overlap with already-accepted ones
    const accepted: TextChange[] = [];
    let minStart = Infinity;
    for (const change of sorted) {
      const changeEnd = change.start + change.length;
      if (changeEnd <= minStart) {
        accepted.push(change);
        minStart = change.start;
      }
    }

    if (!dryRun) {
      const absPath = join(projectPath, file);
      let content = readFileSync(absPath, "utf-8");
      for (const change of accepted) {
        content =
          content.slice(0, change.start) +
          change.newText +
          content.slice(change.start + change.length);
      }
      writeFileSync(absPath, content);
    }

    results.push({
      file,
      applied: accepted.length,
      skipped: sorted.length - accepted.length,
    });
  }

  return results;
}
