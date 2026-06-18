import { join } from "node:path";
import { existsSync, statSync } from "node:fs";
import { createProgram } from "./program.js";
import { buildReferenceIndex } from "./reference-index.js";
import {
  scanFiles,
  scanChangedFiles,
  scanCommitFiles,
  scanBranchFiles,
  setMaxFileSize,
  loadIgnorePatterns,
  collectFilesFromDir,
} from "./scanner.js";
import type {
  CliOptions,
  LintResult,
  Diagnostic,
  RuleContext,
  RuleDefinition,
  DlintConfig,
  RuleOverride,
} from "../types.js";
import { resolveGroups } from "../config/groups.js";

export function lint(
  opts: CliOptions,
  allRules: readonly RuleDefinition[],
  config: DlintConfig
): LintResult {
  const start = performance.now();
  const diagnostics: Diagnostic[] = [];

  if (config.maxFileSize) setMaxFileSize(config.maxFileSize);

  const extensions = (config.include ?? ["**/*.ts", "**/*.tsx"])
    .map((p) => `.${p.split(".").pop() ?? "ts"}`)
    .filter((e) => e.length > 1);
  const ig = loadIgnorePatterns(opts.path);
  if (config.exclude) for (const d of config.exclude) ig.add(d);
  function isExcluded(f: string): boolean { return ig.ignores(f); }

  let files: string[];
  if (opts.files.length > 0) {
    const expanded: string[] = [];
    for (const f of opts.files) {
      const absPath = join(opts.path, f);
      if (!existsSync(absPath)) {
        console.error(`Error: "${f}" not found.\nUsage: --files <file.ts|directory>\n  Examples:\n    --files src/components\n    --files src/components/button.tsx`);
        process.exit(1);
      }
      if (statSync(absPath).isDirectory()) {
        expanded.push(...collectFilesFromDir(absPath, extensions, opts.path, ig));
      } else {
        expanded.push(f);
      }
    }
    files = expanded.filter((f) => !isExcluded(f));
  } else if (opts.commit) {
    files = scanCommitFiles(opts.path, extensions).filter((f) => !isExcluded(f));
  } else if (opts.branch) {
    files = scanBranchFiles(opts.path, extensions, config.baseBranch).filter((f) => !isExcluded(f));
  } else if (opts.changed) {
    files = scanChangedFiles(opts.path, extensions).filter((f) => !isExcluded(f));
  } else {
    files = scanFiles(opts.path, extensions, config.exclude);
  }

  const { program, saveBuildInfo } = createProgram(opts.path, config.tsconfig);
  const checker = program.getTypeChecker();
  const referenceIndex = buildReferenceIndex(program, checker);
  const referencesDir = config.referencesDir ?? ".dlint/references";

  const rules =
    opts.rules.length > 0
      ? allRules.filter((r) => opts.rules.includes(r.id))
      : allRules;

  const fileOverrides = (config.overrides ?? []).filter(
    (o): o is RuleOverride & { files: string[] } => !!o.files?.length,
  );

  // Global (non-file-scoped) sub-check disables: built-in/user groups set off, plus any
  // global "ruleId:subCheckId" override set off. Applied to every file.
  const globalDisabledSubChecks = new Set<string>(resolveGroups(config.groups).disabledSubChecks);
  for (const o of config.overrides ?? []) {
    if (!o.files?.length && o.severity === "off" && o.ruleId.includes(":")) {
      globalDisabledSubChecks.add(o.ruleId);
    }
  }

  function getDisabledSubChecks(ruleId: string, filePath: string): Set<string> {
    const disabled = new Set<string>();
    for (const full of globalDisabledSubChecks) {
      if (full.startsWith(ruleId + ":")) disabled.add(full.slice(ruleId.length + 1));
    }
    for (const o of fileOverrides) {
      if (o.severity !== "off") continue;
      if (!o.files.some((g) => filePath.includes(g))) continue;
      if (o.ruleId.startsWith(ruleId + ":")) {
        disabled.add(o.ruleId.slice(ruleId.length + 1));
      }
    }
    return disabled;
  }

  function isRuleDisabledForFile(ruleId: string, filePath: string): boolean {
    return fileOverrides.some(
      (o) => o.ruleId === ruleId && o.severity === "off" && o.files.some((g) => filePath.includes(g)),
    );
  }

  for (const relPath of files) {
    const absPath = join(opts.path, relPath);
    const sourceFile = program.getSourceFile(absPath);
    if (!sourceFile) continue;

    for (const rule of rules) {
      if (isRuleDisabledForFile(rule.id, relPath)) continue;
      const disabledSubChecks = getDisabledSubChecks(rule.id, relPath);
      const context = {
        program,
        checker,
        referenceIndex,
        sourceFile,
        referencesDir,
        report: (diag) =>
          diagnostics.push({ ...diag, file: relPath, severity: rule.severity }),
        isSubCheckDisabled: (id: string) => disabledSubChecks.has(id),
        options: config.ruleOptions?.[rule.id] ?? {},
      } satisfies RuleContext;
      rule.check(context);
    }

  }

  // Persist incremental build info for next run
  saveBuildInfo();

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const checkCount = rules.reduce((sum, r) => sum + (r.meta.subChecks ?? 1), 0);
  const fixableCount = diagnostics.filter((d) => !!d.advisory?.fix).length;
  return {
    diagnostics,
    fileCount: files.length,
    ruleCount: rules.length,
    checkCount,
    errorCount,
    warningCount: diagnostics.length - errorCount,
    durationMs: Math.round(performance.now() - start),
    fixableCount,
  };
}
