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
        // Only present when a rule file failed to load, so the usual payload stays unchanged.
        ...(result.skippedRules?.length
          ? { skippedRules: result.skippedRules }
          : {}),
      },
      null,
      2
    ) + "\n"
  );
}
