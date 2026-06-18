import type {
  LintResult,
  ExtractResult,
  RuleDefinition,
  ExtractorDefinition,
  DashboardAdapter,
  FunctionTag,
  GapSeverity,
  Severity,
} from "../types.js";

// === ReportData: typed bridge Node.js → Browser ===

export interface ScoreCard {
  label: string;
  value: number;
  total: number;
  pct: number;
  source: string;
}

export interface GapItem {
  action: string;
  file: string;
  issue: string;
  severity: GapSeverity;
  fixHint: string;
  reference: string;
}

interface PromptBlock {
  id: string;
  title: string;
  gapCount: number;
  prompt: string;
}
export interface FindingGroup {
  ruleId: string;
  category: string;
  description: string;
  count: number;
  isWarningOnly: boolean;
}

export interface ReportData {
  meta: { generatedAt: string; projectPath: string };
  scores: ScoreCard[];
  findingsByRule: FindingGroup[];
  findingsByFile: FileFindings[];
  gaps: GapItem[];
  prompts: PromptBlock[];
  summary: {
    files: number;
    rules: number;
    findings: number;
    actions: number;
    fixable: number;
  };
}

interface FileFinding {
  rule: string;
  category: string;
  severity: Severity;
  message: string;
  line: number;
}

export interface FileFindings {
  file: string;
  findings: FileFinding[];
  errorCount: number;
  warningCount: number;
}

// === Generic adapter evaluation — zero project-specific logic ===

function asDashboard(d: unknown): DashboardAdapter | undefined {
  if (!d || typeof d !== "object") return undefined;
  return d;
}

function evaluateGaps(
  extractors: readonly ExtractorDefinition[],
  extractData: ExtractResult,
): GapItem[] {
  const gaps: GapItem[] = [];
  for (const ext of extractors) {
    const db = asDashboard(ext.dashboard);
    if (!db?.gaps) continue;
    const items = extractData.extractors[ext.id]?.items ?? [];
    for (const def of db.gaps) {
      for (const item of items) {
        if (!def.condition(item)) continue;
        const issue =
          typeof def.issue === "function" ? def.issue(item) : def.issue;
        const nv = db.nodeView;
        const name = nv
          ? nv.label(item)
          : String((item as Record<string, unknown>).functionName ?? ext.id);
        const file = nv ? (nv.filePath(item).split("/").pop() ?? "") : "";
        gaps.push({
          action: name,
          file,
          issue,
          severity: def.severity,
          fixHint: def.fixHint,
          reference: "—",
        });
      }
    }
  }
  return gaps.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });
}

function buildFindingsPerFile(
  lint: LintResult,
  rules: readonly RuleDefinition[],
): FileFindings[] {
  const ruleCategories = new Map<string, string>();
  for (const r of rules) ruleCategories.set(r.id, r.meta.category);
  const byFile = new Map<string, FileFinding[]>();
  for (const d of lint.diagnostics) {
    const findings = byFile.get(d.file) ?? [];
    findings.push({
      rule: d.rule,
      category: ruleCategories.get(d.rule) ?? "quality",
      severity: d.severity,
      message: d.message,
      line: d.line,
    });
    byFile.set(d.file, findings);
  }
  return [...byFile.entries()]
    .map(([file, findings]) => ({
      file,
      findings,
      errorCount: findings.filter((f) => f.severity === "error").length,
      warningCount: findings.filter((f) => f.severity === "warning").length,
    }))
    .sort((a, b) => b.findings.length - a.findings.length);
}

function buildFindings(
  lint: LintResult,
  rules: readonly RuleDefinition[],
): FindingGroup[] {
  const ruleCategories = new Map<string, string>();
  for (const r of rules) ruleCategories.set(r.id, r.meta.category);
  const ruleDescriptions = new Map<string, string>();
  for (const r of rules) ruleDescriptions.set(r.id, r.meta.description);
  const ruleSeverities = new Map<string, Set<string>>();
  for (const d of lint.diagnostics) {
    const set = ruleSeverities.get(d.rule) ?? new Set<string>();
    set.add(d.severity);
    ruleSeverities.set(d.rule, set);
  }
  const counts = new Map<string, number>();
  for (const d of lint.diagnostics)
    counts.set(d.rule, (counts.get(d.rule) ?? 0) + 1);
  return [...counts.entries()]
    .map(([ruleId, count]) => ({
      ruleId,
      category: ruleCategories.get(ruleId) ?? "quality",
      description: ruleDescriptions.get(ruleId) ?? "",
      count,
      isWarningOnly: ruleSeverities.get(ruleId)?.has("error") !== true,
    }))
    .sort((a, b) => b.count - a.count);
}

function buildPrompts(gaps: readonly GapItem[]): PromptBlock[] {
  const prompts: PromptBlock[] = [];
  const byIssueType = new Map<string, GapItem[]>();
  for (const g of gaps) {
    const key = (g.issue.split("—")[0] ?? "").trim();
    let bucket = byIssueType.get(key);
    if (!bucket) {
      bucket = [];
      byIssueType.set(key, bucket);
    }
    bucket.push(g);
  }
  for (const [issueType, items] of byIssueType) {
    const list = items.map((g) => `- ${g.action} (${g.file})`).join("\n");
    prompts.push({
      id: issueType.toLowerCase().replace(/\s+/g, "-"),
      title: `Fix: ${issueType} (${items.length} items)`,
      gapCount: items.length,
      prompt: `Fix these ${items.length} issues — ${issueType}:\n\n${list}\n\nPattern: ${items[0]?.fixHint ?? ""}\nVerify each fix with: npx dlint --files <file>`,
    });
  }
  if (gaps.length > 0) {
    prompts.unshift({
      id: "fix-all",
      title: `Fix Everything (${gaps.length} issues)`,
      gapCount: gaps.length,
      prompt: `Complete remediation — ${gaps.length} issues.\n\n${prompts.map((p) => p.prompt).join("\n\n---\n\n")}`,
    });
  }
  return prompts;
}

// === Main entry ===

export function buildReportData(
  lint: LintResult,
  extract: ExtractResult,
  rules: readonly RuleDefinition[],
  projectPath: string,
  extractors?: readonly ExtractorDefinition[],
): ReportData {
  // Extractor-based gap evaluation
  const gaps = extractors ? evaluateGaps(extractors, extract) : [];

  const totalFiles = lint.fileCount;
  const findingsByFile = buildFindingsPerFile(lint, rules);

  const ruleCategories = new Map<string, string>();
  for (const r of rules) ruleCategories.set(r.id, r.meta.category);

  // Scores count only errors — warnings (from config overrides) are advisory, not violations
  const errorDiagnostics = lint.diagnostics.filter(
    (d) => d.severity === "error",
  );
  const errorFiles = new Set(errorDiagnostics.map((d) => d.file));
  const cleanCount = totalFiles - errorFiles.size;
  const cleanPct =
    totalFiles > 0 ? Math.round((cleanCount / totalFiles) * 1000) / 10 : 100;

  const scores: ScoreCard[] = [];
  const categorySet = [...new Set(rules.map((r) => r.meta.category))];
  for (const cat of categorySet) {
    const catFiles = new Set<string>();
    for (const d of errorDiagnostics) {
      if (ruleCategories.get(d.rule) === cat) catFiles.add(d.file);
    }
    const clean = totalFiles - catFiles.size;
    const pct =
      totalFiles > 0 ? Math.round((clean / totalFiles) * 1000) / 10 : 100;
    scores.push({
      label: cat.charAt(0).toUpperCase() + cat.slice(1),
      value: clean,
      total: totalFiles,
      pct,
      source: `Files without ${cat} errors`,
    });
  }
  scores.push({
    label: "Clean Files",
    value: cleanCount,
    total: totalFiles,
    pct: cleanPct,
    source: "Files with zero errors",
  });
  const tagItems = (extract.extractors["function-tags"]?.items ??
    []) as FunctionTag[];
  if (tagItems.length > 0) {
    const allTags = [...new Set(tagItems.flatMap((a) => a.tags))];
    for (const tag of allTags) {
      const count = tagItems.filter((a) => a.tags.includes(tag)).length;
      const pct = Math.round((count / tagItems.length) * 1000) / 10;
      scores.push({
        label: `Tag: ${tag}`,
        value: count,
        total: tagItems.length,
        pct,
        source: `Functions with '${tag}'`,
      });
    }
  }
  const prompts = buildPrompts(gaps);

  return {
    meta: { generatedAt: new Date().toISOString(), projectPath },
    scores,
    findingsByRule: buildFindings(lint, rules),
    findingsByFile,
    gaps,
    prompts,
    summary: {
      files: lint.fileCount,
      rules: lint.ruleCount,
      findings: lint.diagnostics.length,
      actions: tagItems.length,
      fixable: lint.fixableCount,
    },
  };
}
