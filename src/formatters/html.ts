import type { LintResult, ExtractResult, RuleDefinition, ExtractorDefinition, CliOptions } from "../types.js";
import { buildReportData } from "./html-data.js";
import { generateTemplate } from "./html-template.js";
import type { ReportData } from "./html-data.js";

export function formatHtml(
  lint: LintResult,
  extract: ExtractResult,
  rules: readonly RuleDefinition[],
  opts: CliOptions,
  extractors?: readonly ExtractorDefinition[]
): { html: string; data: ReportData } {
  const data = buildReportData(lint, extract, rules, opts.path, extractors);
  return { html: generateTemplate(data), data };
}
