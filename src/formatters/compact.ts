import type { LintResult, CliOptions } from "../types.js";

export function formatCompact(result: LintResult, _: CliOptions): string {
  const lines = result.diagnostics.map(
    (d) =>
      `${d.file}:${d.line}:${d.column} ${d.severity} [${d.rule}] ${d.message}`
  );
  lines.push(
    `\n${result.errorCount} errors, ${result.warningCount} warnings`
  );
  for (const s of result.skippedRules ?? []) {
    lines.push(`skipped rule ${s.file}: ${s.reason}`);
  }
  return lines.join("\n") + "\n";
}
