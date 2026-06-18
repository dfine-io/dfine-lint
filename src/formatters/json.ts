import type { LintResult, CliOptions } from "../types.js";

export function formatJson(result: LintResult, _: CliOptions): string {
  return (
    JSON.stringify(
      {
        files: result.fileCount,
        rules: result.ruleCount,
        checks: result.checkCount,
        durationMs: result.durationMs,
        errors: result.errorCount,
        warnings: result.warningCount,
        diagnostics: result.diagnostics,
      },
      null,
      2
    ) + "\n"
  );
}
