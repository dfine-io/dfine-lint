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
  LintTimings,
} from "../types.js";
import type { SeverityPolicy } from "../config/severity.js";

export function lint(
  opts: CliOptions,
  allRules: readonly RuleDefinition[],
  config: DlintConfig,
  severity: SeverityPolicy,
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

  let fileCount = 0;
  for (const relPath of files) {
    const absPath = join(opts.path, relPath);
    const sourceFile = program.getSourceFile(absPath);
    if (!sourceFile) continue;
    fileCount++;

    for (const rule of rules) {
      if (!severity.runsIn(rule, relPath)) continue;
      const ruleSeverity = severity.of(rule, undefined, relPath);
      // Rules may ask per node, so each sub-check is resolved once per file
      const subCheckOff = new Map<string, boolean>();
      const context = {
        program,
        checker,
        referenceIndex,
        sourceFile,
        projectRoot: opts.path,
        referencesDir,
        report: (diag) => {
          const level = diag.subCheck === undefined ? ruleSeverity : severity.of(rule, diag.subCheck, relPath);
          if (level !== "off") diagnostics.push({ ...diag, file: relPath, severity: level });
        },
        isSubCheckDisabled: (id: string) => {
          let off = subCheckOff.get(id);
          if (off === undefined) subCheckOff.set(id, (off = severity.of(rule, id, relPath) === "off"));
          return off;
        },
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
