// html-template.ts — Obsidian v2 Template with {{}} injection system
// Pre-renders all HTML server-side. Client JS handles only UI interactions (tabs, search, toggle, copy).

import type {
  ReportData,
  FileFindings,
  FindingGroup,
  GapItem,
  ScoreCard,
} from "./html-data.js";
import { esc } from "./esc.js";

// === Template injection ===

function inject(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars))
    result = result.replaceAll(`{{${key}}}`, value);
  return result;
}

// === Entry point ===

export function generateTemplate(data: ReportData): string {
  return inject(TEMPLATE, {
    META_PROJECT: esc(data.meta.projectPath.split("/").pop() ?? "dlint"),
    META_FILES: String(data.summary.files),
    META_RULES: String(data.summary.rules),
    META_FINDINGS: String(data.summary.findings),
    META_FIXABLE: String(data.summary.fixable),
    META_DATE: data.meta.generatedAt.slice(0, 10),
    SCORE_CARDS: renderScoreCards(data.scores),
    SUB_STATS: renderSubStats(data.summary),
    FINDINGS_TABLE: renderFindingsTable(data.findingsByRule),
    CATEGORY_TABLE: renderCategoryTable(data.findingsByRule),
    TOP_FILES: renderTopFiles(data.findingsByFile),
    GAP_SUMMARY: renderGapSummary(data.gaps),
    RULE_COUNT: String(data.findingsByRule.length),
    RULE_CHIPS: renderFilterChips(data.findingsByRule),
    RULE_GROUPS: renderRuleGroups(data.findingsByFile, data.findingsByRule),
    DUPLICATION_COUNT: String(countCloneFindings(data.findingsByFile)),
    DUPLICATION_CONTENT: renderDuplicationFromFindings(data.findingsByFile),
    GAP_COUNT: String(data.gaps.length),
    GAP_TABLE: renderGapTable(data.gaps),
    SEVERITY_PROMPTS: renderSeverityPrompts(data.gaps),
    PROMPT_COUNT: String(data.prompts.length + data.findingsByRule.length + 4),
    FIX_ALL_PROMPT: renderFixAllPrompt(data),
    PER_RULE_PROMPTS: renderPerRulePrompts(
      data.findingsByRule,
      data.findingsByFile,
    ),
    PER_SEVERITY_PROMPTS: renderPerSeverityPrompts(data.gaps),
  });
}

// === Render functions ===

function renderScoreCards(scores: readonly ScoreCard[]): string {
  return scores
    .map((s) => {
      let color = "var(--red)";
      if (s.pct >= 80) color = "var(--green)";
      else if (s.pct >= 50) color = "var(--amber)";
      return (
        `<div class="card"><div class="label">${esc(s.label)}</div>` +
        `<div class="value" style="color:${color}">${s.total > 0 ? String(s.pct) + '<span class="unit">%</span>' : String(s.value) + '<span class="unit"> items</span>'}</div>` +
        `<div class="bar"><div class="bar-fill" style="width:${s.total > 0 ? s.pct : Math.max(0, 100 - s.value)}%;background:${color}"></div></div>` +
        `<div class="source">${s.value}${s.total > 0 ? "/" + String(s.total) + " — " : " — "}${esc(s.source)}</div></div>`
      );
    })
    .join("");
}

function renderSubStats(s: ReportData["summary"]): string {
  const items = [
    { num: s.files, lbl: "Files" },
    { num: s.rules, lbl: "Rules" },
    { num: s.findings, lbl: "Findings" },
    { num: s.actions, lbl: "Actions" },
    { num: s.fixable, lbl: "Fixable" },
    { num: 4, lbl: "Categories" },
  ];
  return items
    .map(
      (i) =>
        `<div class="sub-stat"><div class="num">${i.num}</div><div class="lbl">${i.lbl}</div></div>`,
    )
    .join("");
}

function renderFindingsTable(groups: readonly FindingGroup[]): string {
  const maxCount = Math.max(...groups.map((g) => g.count), 1);
  const rows = groups
    .map((g) => {
      const barWidth = Math.round((g.count / maxCount) * 66);
      const warnBadge = g.isWarningOnly
        ? ' <span class="sev sev-l">warning</span>'
        : "";
      return (
        `<tr><td>${esc(g.ruleId)}${warnBadge}</td><td><span class="cat cat-${esc(g.category)}">${esc(g.category)}</span></td>` +
        `<td style="text-align:right">${g.count}</td>` +
        `<td><span class="inline-bar" style="width:${barWidth}px;background:var(--${catColor(g.category)})"></span></td></tr>`
      );
    })
    .join("");
  const total = groups.reduce((s, g) => s + g.count, 0);
  return (
    `<table><thead><tr><th>Rule</th><th>Category</th><th style="text-align:right">Count</th><th style="width:80px">Dist</th></tr></thead>` +
    `<tbody>${rows}</tbody><tfoot><tr><td>Total</td><td></td><td style="text-align:right">${total}</td><td></td></tr></tfoot></table>`
  );
}

function renderCategoryTable(groups: readonly FindingGroup[]): string {
  const cats = new Map<string, number>();
  for (const g of groups)
    cats.set(g.category, (cats.get(g.category) ?? 0) + g.count);
  const total = [...cats.values()].reduce((s, c) => s + c, 0);
  const rows = [...cats.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(
      ([cat, count]) =>
        `<tr><td style="color:var(--${catColor(cat)})">${esc(cat)}</td><td style="text-align:right">${count}</td><td style="text-align:right">${total > 0 ? ((count / total) * 100).toFixed(1) : 0}%</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>Category</th><th style="text-align:right">Findings</th><th style="text-align:right">%</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderTopFiles(files: readonly FileFindings[]): string {
  const rows = files
    .slice(0, 5)
    .map(
      (f) =>
        `<tr><td style="color:var(--cyan)">${esc(f.file.split("/").pop() ?? f.file)}</td><td style="text-align:right">${f.findings.length}</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>File</th><th style="text-align:right">#</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderGapSummary(gaps: readonly GapItem[]): string {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const g of gaps) counts[g.severity]++;
  const colors = {
    critical: "var(--red)",
    high: "var(--amber)",
    medium: "var(--cyan)",
    low: "var(--dim)",
  };
  return (["critical", "high", "medium", "low"] as const)
    .map(
      (s) =>
        `<div class="gap-card"><div class="num" style="color:${colors[s]}">${counts[s]}</div><div class="lbl">${s}</div></div>`,
    )
    .join("");
}

function renderFilterChips(groups: readonly FindingGroup[]): string {
  const cats = new Map<string, number>();
  for (const g of groups)
    cats.set(g.category, (cats.get(g.category) ?? 0) + g.count);
  return [...cats.entries()]
    .map(
      ([cat, count]) =>
        `<div class="chip chip-${cat} active" onclick="this.classList.toggle('active');filterRules()">${cat} <span style="opacity:0.5">${count}</span></div>`,
    )
    .join("");
}

function renderRuleGroups(
  byFile: readonly FileFindings[],
  byRule: readonly FindingGroup[],
): string {
  // Build: rule → {category, files: {route → {file → violations[]}}}
  const ruleFileMap = new Map<
    string,
    Map<string, Map<string, { line: number; message: string }[]>>
  >();
  for (const ff of byFile) {
    const route = extractRoute(ff.file);
    for (const f of ff.findings) {
      let routeMap = ruleFileMap.get(f.rule);
      if (!routeMap) {
        routeMap = new Map();
        ruleFileMap.set(f.rule, routeMap);
      }
      let fileMap = routeMap.get(route);
      if (!fileMap) {
        fileMap = new Map();
        routeMap.set(route, fileMap);
      }
      const violations = fileMap.get(ff.file) ?? [];
      violations.push({ line: f.line, message: f.message });
      fileMap.set(ff.file, violations);
    }
  }

  return byRule
    .map((rule) => {
      const routeMap = ruleFileMap.get(rule.ruleId);
      const totalFiles = routeMap
        ? [...routeMap.values()].reduce((s, fm) => s + fm.size, 0)
        : 0;
      let routeHtml = "";
      if (routeMap) {
        for (const [route, fileMap] of [...routeMap.entries()].sort(
          (a, b) => b[1].size - a[1].size,
        )) {
          const routeCount = [...fileMap.values()].reduce(
            (s, v) => s + v.length,
            0,
          );
          let filesHtml = "";
          for (const [filePath, violations] of [...fileMap.entries()].sort(
            (a, b) => b[1].length - a[1].length,
          )) {
            const fileName = filePath.split("/").pop() ?? filePath;
            const violationsHtml = violations
              .sort((a, b) => a.line - b.line)
              .map(
                (v) =>
                  `<div class="violation"><span class="ln">L${v.line}</span> <span class="msg">${esc(v.message)}</span></div>`,
              )
              .join("");
            filesHtml += `<div class="file-entry"><div class="file-name">${esc(fileName)} <span style="color:var(--dim)">(${violations.length})</span></div>${violationsHtml}</div>`;
          }
          routeHtml += `<div class="route-group"><div class="route-header" onclick="toggleRoute(this)">▼ ${esc(route)} — ${routeCount} findings · ${fileMap.size} files</div><div class="route-files">${filesHtml}</div></div>`;
        }
      }

      const analysis = analyzeRule(
        rule.ruleId,
        rule.category,
        rule.description,
        rule.count,
        byFile,
      );
      const promptText = buildRichPrompt(analysis);
      const warnBadge = rule.isWarningOnly
        ? '<span class="sev sev-l" style="margin-left:6px">warning</span>'
        : "";
      return (
        `<div class="rule-group" data-category="${esc(rule.category)}">` +
        `<div class="rule-header" onclick="toggleRule(this)"><span class="arrow">▶</span>` +
        `<span class="name">${esc(rule.ruleId)}</span>` +
        `<span class="count">${rule.count} findings · ${totalFiles} files</span>${warnBadge}` +
        `<span class="cat cat-${esc(rule.category)}">${esc(rule.category)}</span></div>` +
        `<div class="rule-body">${routeHtml}` +
        `<div class="prompt-block"><button class="copy-btn" onclick="copyPrompt(this)">Copy</button>${esc(promptText)}</div>` +
        `</div></div>`
      );
    })
    .join("");
}

const CLONE_RULES = new Set(["semantic-clone", "syntactic-clone"]);

function countCloneFindings(byFile: readonly FileFindings[]): number {
  let count = 0;
  for (const ff of byFile)
    for (const f of ff.findings) {
      if (CLONE_RULES.has(f.rule)) count++;
    }
  return count;
}

function renderDuplicationFromFindings(
  byFile: readonly FileFindings[],
): string {
  const findings: {
    file: string;
    line: number;
    message: string;
    rule: string;
  }[] = [];
  for (const ff of byFile)
    for (const f of ff.findings) {
      if (CLONE_RULES.has(f.rule))
        findings.push({
          file: ff.file,
          line: f.line,
          message: f.message,
          rule: f.rule,
        });
    }
  if (findings.length === 0)
    return `<div style="padding:40px;text-align:center;color:var(--green)">No code duplication detected.</div>`;
  const byRule = new Map<string, typeof findings>();
  for (const f of findings) {
    const g = byRule.get(f.rule) ?? [];
    g.push(f);
    byRule.set(f.rule, g);
  }
  let html = `<p style="color:var(--dim);margin-bottom:14px;font-size:12px;line-height:1.7">Code duplication — semantic-clone and syntactic-clone rule findings.</p>`;
  for (const [ruleId, items] of byRule) {
    html += `<div class="section-title">${esc(ruleId)} (${items.length})</div>`;
    for (const f of items) {
      const fileName = f.file.split("/").pop() ?? f.file;
      html +=
        `<div class="rule-group" style="margin-bottom:6px">` +
        `<div class="rule-header" onclick="toggleRule(this)"><span class="arrow">▶</span>` +
        `<span class="name">${esc(fileName)}:${f.line}</span>` +
        `<span class="cat cat-architecture">architecture</span></div>` +
        `<div class="rule-body"><div class="violation" style="font-size:11px;color:var(--text);padding:6px 0">${esc(f.message)}</div></div></div>`;
    }
  }
  return html;
}

function renderGapTable(gaps: readonly GapItem[]): string {
  if (gaps.length === 0)
    return `<div style="padding:40px;text-align:center;color:var(--green)">No gaps detected — all constraints satisfied.</div>`;
  const sevClass = {
    critical: "sev-c",
    high: "sev-h",
    medium: "sev-m",
    low: "sev-l",
  } as const;
  const rows = gaps
    .map(
      (g) =>
        `<tr><td>${esc(g.file)}</td><td>${esc(g.action)}</td><td><span class="sev ${sevClass[g.severity]}">${g.severity}</span></td>` +
        `<td>${esc(g.issue)}</td><td style="font-size:10px">${esc(g.fixHint)}</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>File</th><th>Action</th><th>Severity</th><th>Issue</th><th>Fix Hint</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderSeverityPrompts(gaps: readonly GapItem[]): string {
  if (gaps.length === 0) return "";
  const sevs = ["critical", "high", "medium", "low"] as const;
  const colors = {
    critical: "var(--red)",
    high: "var(--amber)",
    medium: "var(--cyan)",
    low: "var(--dim)",
  };
  return sevs
    .map((sev) => {
      const items = gaps.filter((g) => g.severity === sev);
      if (items.length === 0) return "";
      const ruleBreakdown = new Map<string, number>();
      for (const g of items)
        ruleBreakdown.set(
          (g.issue.split("—")[0] ?? "").trim(),
          (ruleBreakdown.get((g.issue.split("—")[0] ?? "").trim()) ?? 0) + 1,
        );
      const files = [...new Set(items.map((g) => g.file))];
      const lines: string[] = [];
      lines.push(
        `[${sev.toUpperCase()}] ${items.length} findings across ${files.length} files`,
      );
      lines.push("");
      if (ruleBreakdown.size > 1) {
        lines.push("Issue breakdown:");
        for (const [issue, ct] of [...ruleBreakdown.entries()].sort(
          (a, b) => b[1] - a[1],
        ))
          lines.push(`  - ${issue} (${ct})`);
        lines.push("");
      }
      lines.push("Affected files with fix hints:");
      for (const g of items) lines.push(`  - ${g.file}: ${g.fixHint}`);
      lines.push("");
      lines.push(`Verify: npx dlint --files ${files.join(" ")}`);
      const promptText = lines.join("\n");
      return (
        `<div class="rule-group"><div class="rule-header" onclick="toggleRule(this)"><span class="arrow">▶</span><span class="name" style="color:${colors[sev]}">${sev} — ${items.length} findings</span></div>` +
        `<div class="rule-body"><div class="prompt-block" style="border-left-color:${colors[sev]}"><button class="copy-btn" onclick="copyPrompt(this)">Copy</button>${esc(promptText)}</div></div></div>`
      );
    })
    .join("");
}

function renderFixAllPrompt(data: ReportData): string {
  const allFiles = [...new Set(data.findingsByFile.map((f) => f.file))];
  const lines: string[] = [];
  lines.push(
    `Complete remediation of ${data.summary.findings} dlint findings across ${data.summary.files} files.`,
  );
  lines.push("");
  lines.push("Priority: CRITICAL -> HIGH -> MEDIUM -> LOW");
  lines.push("");
  lines.push("Rule breakdown:");
  for (const g of data.findingsByRule) {
    const analysis = analyzeRule(
      g.ruleId,
      g.category,
      g.description,
      g.count,
      data.findingsByFile,
    );
    const subSummary =
      analysis.subChecks.length > 1
        ? " (" +
          analysis.subChecks
            .slice(0, 3)
            .map((s) => `${s.pattern}: ${s.count}`)
            .join(", ") +
          ")"
        : "";
    lines.push(`  - ${g.ruleId} (${g.count}) [${g.category}]${subSummary}`);
  }
  lines.push("");
  lines.push(
    `Top files by finding count (${Math.min(allFiles.length, 10)} of ${allFiles.length}):`,
  );
  for (const f of data.findingsByFile.slice(0, 10)) {
    lines.push(`  - ${f.file.split("/").pop()} (${f.findings.length})`);
  }
  lines.push("");
  lines.push(`Verify per batch: npx dlint --files [changed-files]`);
  lines.push(`Full scan: npx dlint`);
  return `<div class="prompt-block"><button class="copy-btn" onclick="copyPrompt(this)">Copy</button>${esc(lines.join("\n"))}</div>`;
}

function renderPerRulePrompts(
  groups: readonly FindingGroup[],
  byFile: readonly FileFindings[],
): string {
  return groups
    .map((g) => {
      const analysis = analyzeRule(
        g.ruleId,
        g.category,
        g.description,
        g.count,
        byFile,
      );
      const promptText = buildRichPrompt(analysis);
      return `<div class="prompt-block" style="border-left-color:var(--${catColor(g.category)})"><button class="copy-btn" onclick="copyPrompt(this)">Copy</button>${esc(promptText)}</div>`;
    })
    .join("");
}

function renderPerSeverityPrompts(gaps: readonly GapItem[]): string {
  if (gaps.length === 0)
    return `<div style="padding:20px;text-align:center;color:var(--dim)">No severity-based prompts — no gaps detected.</div>`;
  const sevs = ["critical", "high", "medium", "low"] as const;
  const colors = {
    critical: "var(--red)",
    high: "var(--amber)",
    medium: "var(--cyan)",
    low: "var(--dim)",
  };
  return sevs
    .map((sev) => {
      const items = gaps.filter((g) => g.severity === sev);
      if (items.length === 0) return "";
      const files = [...new Set(items.map((g) => g.file))];
      const lines: string[] = [];
      lines.push(
        `[${sev.toUpperCase()}] ${items.length} findings across ${files.length} files`,
      );
      lines.push("");
      for (const g of items)
        lines.push(`- ${g.action} (${g.file}): ${g.fixHint}`);
      lines.push("");
      lines.push(`Verify: npx dlint --files ${files.join(" ")}`);
      return `<div class="prompt-block" style="border-left-color:${colors[sev]}"><button class="copy-btn" onclick="copyPrompt(this)">Copy</button>${esc(lines.join("\n"))}</div>`;
    })
    .join("");
}

// === Helpers ===

function catColor(category: string): string {
  switch (category) {
    case "quality":
      return "blue";
    case "security":
      return "red";
    case "architecture":
      return "amber";
    case "performance":
      return "cyan";
    default:
      return "dim";
  }
}

function extractRoute(filePath: string): string {
  const parts = filePath.split("/");
  const dir = parts.slice(0, -1);
  if (dir.length >= 3) return dir.slice(-3).join("/");
  if (dir.length >= 2) return dir.slice(-2).join("/");
  return dir.join("/") || "root";
}

// === Rich Prompt System ===

interface RuleAnalysis {
  ruleId: string;
  category: string;
  description: string;
  count: number;
  fileCount: number;
  subChecks: { pattern: string; count: number }[];
  topFiles: { path: string; shortName: string; count: number }[];
  allFilePaths: string[];
}

function analyzeRule(
  ruleId: string,
  category: string,
  description: string,
  count: number,
  byFile: readonly FileFindings[],
): RuleAnalysis {
  const messageCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();
  for (const ff of byFile) {
    let fileRuleCount = 0;
    for (const f of ff.findings) {
      if (f.rule !== ruleId) continue;
      fileRuleCount++;
      const pattern = ((f.message.split(" — ")[0] ?? "").split(" → ")[0] ?? "").trim();
      messageCounts.set(pattern, (messageCounts.get(pattern) ?? 0) + 1);
    }
    if (fileRuleCount > 0) fileCounts.set(ff.file, fileRuleCount);
  }
  const subChecks = [...messageCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([pattern, ct]) => ({ pattern, count: ct }));
  const topFiles = [...fileCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([path, ct]) => ({
      path,
      shortName: path.split("/").pop() ?? path,
      count: ct,
    }));
  return {
    ruleId,
    category,
    description,
    count,
    fileCount: fileCounts.size,
    subChecks,
    topFiles,
    allFilePaths: [...fileCounts.keys()],
  };
}

function buildRichPrompt(analysis: RuleAnalysis): string {
  const subCheckBreakdown =
    analysis.subChecks.length > 1
      ? "Violation breakdown:\n" +
        analysis.subChecks
          .slice(0, 8)
          .map((sc) => `  - ${sc.pattern} (${sc.count})`)
          .join("\n") +
        (analysis.subChecks.length > 8
          ? `\n  - ... +${analysis.subChecks.length - 8} more patterns`
          : "") +
        "\n"
      : "";
  const topFilesStr = analysis.topFiles
    .map((f) => `  - ${f.shortName} (${f.count})`)
    .join("\n");
  const cmdFiles = analysis.topFiles.map((f) => f.path).join(" ");
  return [
    `[${analysis.ruleId}] ${analysis.count} findings across ${analysis.fileCount} files`,
    `Category: ${analysis.category} — ${analysis.description}`,
    "",
    subCheckBreakdown,
    `Top-impact files (${Math.min(analysis.topFiles.length, 8)} of ${analysis.fileCount}):`,
    topFilesStr,
    "",
    `Verify: npx dlint --files ${cmdFiles}`,
  ].join("\n");
}

// === Obsidian v2 Template ===

const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>dlint — {{META_PROJECT}}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0a0a12;--surface:#10101c;--surface2:#161628;--border:#1e1e38;--text:#c8c8d8;--dim:#555570;--bright:#eeeef6;--green:#22c55e;--amber:#f59e0b;--red:#ef4444;--blue:#6366f1;--cyan:#06b6d4;--pink:#ec4899}
html,body{background:var(--bg);color:var(--text);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.6;height:100%;overflow:hidden}
body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:9999;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.03) 2px,rgba(0,0,0,0.03) 4px)}
.shell{display:flex;flex-direction:column;height:100vh}
.header{padding:12px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px;background:var(--surface)}
.header h1{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;color:var(--green);letter-spacing:2px;text-transform:uppercase}
.header .meta{margin-left:auto;color:var(--dim);font-size:11px}
.header .dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px;background:var(--green);box-shadow:0 0 12px rgba(34,197,94,0.3)}
.tabs{display:flex;border-bottom:1px solid var(--border);background:var(--surface);padding:0 24px}
.tab{padding:9px 18px;cursor:pointer;color:var(--dim);font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid transparent;transition:all .15s}
.tab:hover{color:var(--text)}.tab.active{color:var(--green);border-bottom-color:var(--green)}
.tab .badge{display:inline-block;background:var(--surface2);border:1px solid var(--border);border-radius:3px;padding:1px 6px;font-size:10px;margin-left:4px;color:var(--dim)}
.tab.active .badge{border-color:var(--green);color:var(--green)}
.content{flex:1;overflow-y:auto;padding:20px 24px}
.content::-webkit-scrollbar{width:6px}.content::-webkit-scrollbar-track{background:var(--bg)}.content::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
.panel{display:none}.panel.active{display:block}
.toolbar{display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:4px;flex-wrap:wrap}
.search-input{background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 12px;border-radius:3px;font-family:inherit;font-size:12px;width:220px;outline:none}
.search-input:focus{border-color:var(--green)}.search-input::placeholder{color:var(--dim)}
.filter-chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{padding:4px 10px;border:1px solid var(--border);border-radius:3px;font-size:10px;cursor:pointer;text-transform:uppercase;letter-spacing:1px;color:var(--dim);transition:all .15s;user-select:none}
.chip:hover{border-color:var(--text);color:var(--text)}
.chip.active{border-color:var(--green);color:var(--green);background:rgba(34,197,94,0.08)}
.chip-quality.active{border-color:var(--blue);color:var(--blue);background:rgba(99,102,241,0.08)}
.chip-security.active{border-color:var(--red);color:var(--red);background:rgba(239,68,68,0.08)}
.chip-architecture.active{border-color:var(--amber);color:var(--amber);background:rgba(245,158,11,0.08)}
.chip-performance.active{border-color:var(--cyan);color:var(--cyan);background:rgba(6,182,212,0.08)}
.showing{font-size:10px;color:var(--dim);margin-left:auto}
.card-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
.sub-stats{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:16px}
.sub-stat{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:10px;text-align:center}
.sub-stat .num{font-size:18px;font-weight:700;color:var(--bright)}.sub-stat .lbl{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:var(--dim);margin-top:2px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:16px;position:relative;overflow:hidden}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
.card:nth-child(1)::before{background:var(--green)}.card:nth-child(2)::before{background:var(--cyan)}.card:nth-child(3)::before{background:var(--amber)}.card:nth-child(4)::before{background:var(--blue)}
.card .label{font-size:9px;text-transform:uppercase;letter-spacing:2px;color:var(--dim);margin-bottom:4px}
.card .value{font-size:28px;font-weight:700;color:var(--bright)}.card .value .unit{font-size:12px;color:var(--dim);font-weight:400}
.card .bar{height:3px;background:var(--surface2);border-radius:2px;margin-top:8px;overflow:hidden}
.card .bar-fill{height:100%;border-radius:2px}
.card .source{font-size:9px;color:var(--dim);margin-top:6px}
.two-col{display:grid;grid-template-columns:2fr 1fr;gap:16px}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:6px 10px;font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:var(--dim);border-bottom:1px solid var(--border);font-weight:400}
td{padding:6px 10px;border-bottom:1px solid var(--border);font-size:11px}
tr:hover td{background:rgba(255,255,255,0.02)}
tfoot td{font-weight:700;color:var(--bright);border-top:2px solid var(--border);border-bottom:none;padding:8px 10px}
.section-title{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--bright);text-transform:uppercase;letter-spacing:2px;margin:16px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--border)}
.sev{display:inline-block;padding:2px 6px;border-radius:2px;font-size:9px;text-transform:uppercase;letter-spacing:1px;font-weight:700}
.sev-c{background:rgba(239,68,68,0.15);color:var(--red);border:1px solid rgba(239,68,68,0.3)}
.sev-h{background:rgba(245,158,11,0.15);color:var(--amber);border:1px solid rgba(245,158,11,0.3)}
.sev-m{background:rgba(6,182,212,0.15);color:var(--cyan);border:1px solid rgba(6,182,212,0.3)}
.sev-l{background:rgba(85,85,112,0.15);color:var(--dim);border:1px solid rgba(85,85,112,0.3)}
.cat{display:inline-block;padding:2px 6px;border-radius:2px;font-size:9px;letter-spacing:1px;border:1px solid var(--border);color:var(--dim)}
.cat-quality{border-color:var(--blue);color:var(--blue)}.cat-security{border-color:var(--red);color:var(--red)}
.cat-architecture{border-color:var(--amber);color:var(--amber)}.cat-performance{border-color:var(--cyan);color:var(--cyan)}
.gap-row{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.gap-card{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:12px;text-align:center}
.gap-card .num{font-size:24px;font-weight:700}.gap-card .lbl{font-size:9px;text-transform:uppercase;letter-spacing:2px;color:var(--dim);margin-top:2px}
.inline-bar{display:inline-block;height:8px;border-radius:1px;vertical-align:middle;margin-left:6px}
.rule-group{background:var(--surface);border:1px solid var(--border);border-radius:4px;margin-bottom:6px;overflow:hidden}
.rule-header{padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;transition:background .15s;font-size:12px}
.rule-header:hover{background:var(--surface2)}
.rule-header .arrow{color:var(--dim);font-size:10px;transition:transform .2s;width:12px}.rule-header.open .arrow{transform:rotate(90deg)}
.rule-header .name{font-weight:700;color:var(--bright)}.rule-header .count{color:var(--green);font-size:10px}
.rule-body{display:none;padding:0 14px 14px;border-top:1px solid var(--border)}.rule-body.open{display:block}
.route-group{margin:4px 0 4px 14px;border-left:1px solid var(--border);padding-left:12px}
.route-header{font-size:10px;color:var(--amber);margin-bottom:4px;cursor:pointer;padding:2px 0}.route-header:hover{color:var(--bright)}
.file-entry{margin:3px 0 3px 4px}.file-name{color:var(--cyan);font-size:10px}
.violation{margin:1px 0 1px 12px;font-size:10px;color:var(--dim)}.violation .ln{color:var(--green)}.violation .msg{color:var(--text)}
.prompt-block{background:var(--bg);border:1px solid var(--border);border-left:3px solid var(--green);border-radius:0 4px 4px 0;padding:10px 14px;margin:8px 0;font-size:10px;color:var(--dim);white-space:pre-wrap;position:relative;line-height:1.6}
.prompt-block .copy-btn{position:absolute;top:6px;right:6px;background:var(--surface2);border:1px solid var(--border);color:var(--dim);padding:3px 8px;border-radius:2px;font-family:inherit;font-size:9px;cursor:pointer;text-transform:uppercase;letter-spacing:1px}
.prompt-block .copy-btn:hover{border-color:var(--green);color:var(--green)}
.ist{color:var(--red);background:rgba(239,68,68,0.08);padding:2px 6px;border-radius:2px;font-size:11px}
.soll{color:var(--green);background:rgba(34,197,94,0.08);padding:2px 6px;border-radius:2px;font-size:11px}
.prompt-section{margin-bottom:16px}
.prompt-section h3{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--bright);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
@media(max-width:900px){.card-row{grid-template-columns:repeat(2,1fr)}.two-col{grid-template-columns:1fr}.sub-stats{grid-template-columns:repeat(3,1fr)}}
</style>
</head>
<body>
<div class="shell">
  <div class="header"><span class="dot"></span><h1>dlint report</h1><span class="meta">{{META_PROJECT}} · {{META_FILES}} files · {{META_RULES}} rules · {{META_FINDINGS}} findings · {{META_FIXABLE}} fixable · {{META_DATE}}</span></div>
  <div class="tabs">
    <div class="tab active" data-tab="dashboard">Dashboard</div>
    <div class="tab" data-tab="rulegraph">Rule Graph <span class="badge">{{RULE_COUNT}}</span></div>
    <div class="tab" data-tab="duplication">Code Duplication <span class="badge">{{DUPLICATION_COUNT}}</span></div>
    <div class="tab" data-tab="gaps">Gaps <span class="badge">{{GAP_COUNT}}</span></div>
    <div class="tab" data-tab="prompts">Prompts <span class="badge">{{PROMPT_COUNT}}</span></div>
  </div>
  <div class="content">
    <div class="panel active" id="dashboard">
      <div class="card-row">{{SCORE_CARDS}}</div>
      <div class="sub-stats">{{SUB_STATS}}</div>
      <div class="two-col">
        <div><div class="section-title">Findings by Rule</div>{{FINDINGS_TABLE}}</div>
        <div>
          <div class="section-title">Gap Summary</div><div class="gap-row">{{GAP_SUMMARY}}</div>
          <div class="section-title">By Category</div>{{CATEGORY_TABLE}}
          <div class="section-title">Top Files</div>{{TOP_FILES}}
        </div>
      </div>
    </div>
    <div class="panel" id="rulegraph">
      <div class="toolbar">
        <input class="search-input" type="text" placeholder="Search rules, files, messages..." oninput="searchRules(this.value)">
        <div class="filter-chips">{{RULE_CHIPS}}</div>
        <span class="showing" id="rule-showing"></span>
      </div>
      {{RULE_GROUPS}}
    </div>
    <div class="panel" id="duplication">{{DUPLICATION_CONTENT}}</div>
    <div class="panel" id="gaps">
      {{GAP_TABLE}}
      <div class="section-title" style="margin-top:20px">Severity Prompts</div>
      {{SEVERITY_PROMPTS}}
    </div>
    <div class="panel" id="prompts">
      <div class="prompt-section"><h3>Fix Everything — {{META_FINDINGS}} findings</h3>{{FIX_ALL_PROMPT}}</div>
      <div class="prompt-section"><h3>Per Rule</h3>{{PER_RULE_PROMPTS}}</div>
      <div class="prompt-section"><h3>Per Severity</h3>{{PER_SEVERITY_PROMPTS}}</div>
    </div>
  </div>
</div>
<script>
document.querySelectorAll('.tab').forEach(function(t){t.addEventListener('click',function(){document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active')});document.querySelectorAll('.panel').forEach(function(x){x.classList.remove('active')});t.classList.add('active');document.getElementById(t.dataset.tab).classList.add('active')})});
function toggleRule(el){el.classList.toggle('open');el.nextElementSibling.classList.toggle('open')}
function toggleRoute(el){var f=el.nextElementSibling;if(f)f.style.display=f.style.display==='none'?'block':'none'}
function copyPrompt(btn){var text=btn.parentElement.textContent.replace('Copy','').trim();navigator.clipboard.writeText(text);btn.textContent='Copied!';setTimeout(function(){btn.textContent='Copy'},1500)}
function searchRules(q){var lq=q.toLowerCase();document.querySelectorAll('.rule-group[data-category]').forEach(function(g){var match=!q||g.textContent.toLowerCase().indexOf(lq)>=0;g.style.display=match?'':'none'});updateShowing()}
function filterRules(){var active=[];document.querySelectorAll('.chip.active').forEach(function(c){var t=c.textContent.trim().split(' ')[0];if(t)active.push(t)});document.querySelectorAll('.rule-group[data-category]').forEach(function(g){var cat=g.getAttribute('data-category');g.style.display=active.indexOf(cat)>=0?'':'none'});updateShowing()}
function updateShowing(){var all=document.querySelectorAll('.rule-group[data-category]');var visible=0;all.forEach(function(g){if(g.style.display!=='none')visible++});var el=document.getElementById('rule-showing');if(el)el.textContent='Showing '+visible+' of '+all.length+' rules'}
updateShowing();
</script>
</body>
</html>`;
