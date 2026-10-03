import { join } from "node:path";
import { createProgram } from "./program.js";
import { buildReferenceIndex } from "./reference-index.js";
import { collectFiles } from "./scanner.js";
import type {
  CliOptions,
  LintResult,
  Diagnostic,
  RuleContext,
  RuleDefinition,
  DlintConfig,
  RuleOverride,
  LintTimings,
} from "../types.js";
import { resolveGroups } from "../config/groups.js";

export function lint(
  opts: CliOptions,
  allRules: readonly RuleDefinition[],
  config: DlintConfig
): LintResult {
  const start = performance.now();
  const diagnostics: Diagnostic[] = [];
  const ruleMs = new Map<string, number>();
  const files = collectFiles(opts, config);
  const filesAt = performance.now();

  const { program, saveBuildInfo } = createProgram(opts.path, config.tsconfig);
  const checker = program.getTypeChecker();
  const programAt = performance.now();
  // The checker works lazily; under --benchmark it checks the files up front, so no rule carries that cost
  if (opts.benchmark) {
    for (const relPath of files) {
      const sf = program.getSourceFile(join(opts.path, relPath));
      if (sf) program.getSemanticDiagnostics(sf);
    }
  }
  const typesAt = performance.now();
  const referenceIndex = buildReferenceIndex(program, checker);
  const referencesAt = performance.now();
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

  let fileCount = 0;
  for (const relPath of files) {
    const absPath = join(opts.path, relPath);
    const sourceFile = program.getSourceFile(absPath);
    if (!sourceFile) continue;
    fileCount++;

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
      const ruleStart = performance.now();
      rule.check(context);
      ruleMs.set(rule.id, (ruleMs.get(rule.id) ?? 0) + performance.now() - ruleStart);
    }

  }
  const rulesAt = performance.now();

  // Persist incremental build info for next run
  saveBuildInfo();
  const endAt = performance.now();
  const ms = (from: number, to: number): number => Math.round(to - from);
  const timings = {
    phases: { files: ms(start, filesAt), program: ms(filesAt, programAt), types: ms(programAt, typesAt), references: ms(typesAt, referencesAt), rules: ms(referencesAt, rulesAt), cache: ms(rulesAt, endAt) },
    rules: [...ruleMs].map(([ruleId, total]) => ({ ruleId, ms: Math.round(total) })).sort((a, b) => b.ms - a.ms),
  } satisfies LintTimings;

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const checkCount = rules.reduce((sum, r) => sum + (r.meta.subChecks ?? 1), 0);
  const fixableCount = diagnostics.filter((d) => !!d.advisory?.fix).length;
  return {
    diagnostics,
    fileCount,
    ruleCount: rules.length,
    checkCount,
    errorCount,
    warningCount: diagnostics.length - errorCount,
    durationMs: ms(start, endAt),
    fixableCount,
    ...(opts.benchmark ? { timings } : {}),
  };
}
