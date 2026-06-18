import type { LintResult, CliOptions } from "../types.js";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export function formatTable(result: LintResult, opts: CliOptions): string {
  const lines: string[] = [];
  lines.push(
    `\ndlint — ${result.fileCount} files, ${result.ruleCount} rules (${result.checkCount} checks), ${result.durationMs}ms\n`
  );
  for (const d of result.diagnostics) {
    const icon =
      d.severity === "error" ? `${RED}✗${RESET}` : `${YELLOW}⚠${RESET}`;
    let line = `${icon} ${d.rule}  ${DIM}${d.file}:${d.line}${RESET}    ${d.message}`;
    if (d.advisory) {
      line += `\n       ${DIM}→ ${d.advisory.action}${d.advisory.reference ? ` (see ${d.advisory.reference})` : ""}${RESET}`;
    }
    lines.push(line);
  }
  if (result.diagnostics.length === 0) {
    lines.push(`${GREEN}✓${RESET} No violations found`);
  }
  lines.push(
    `\n${result.errorCount} errors, ${result.warningCount} warnings\n`
  );
  if (opts.benchmark)
    lines.push(`${DIM}Duration: ${result.durationMs}ms${RESET}\n`);
  return lines.join("\n");
}
