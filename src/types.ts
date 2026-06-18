import type ts from "typescript";

export type Severity = "error" | "warning";

type OutputFormat = "table" | "json" | "compact" | "html";

export type GapSeverity = "critical" | "high" | "medium" | "low";

type DeclarationKind = "enum" | "interface" | "type-alias" | "constant" | "function";

export interface TextChange {
  readonly start: number;
  readonly length: number;
  readonly newText: string;
}

export interface Advisory {
  action: string;
  pattern: string;
  reference?: string;
  fix?: TextChange | readonly TextChange[];
}

export interface Diagnostic {
  rule: string;
  severity: Severity;
  file: string;
  line: number;
  column: number;
  message: string;
  advisory?: Advisory;
}

/** Map of absolute file path -> set of exported names referenced from other files */
export type ReferenceIndex = ReadonlyMap<string, ReadonlySet<string>>;

export interface RuleContext {
  program: ts.Program;
  checker: ts.TypeChecker;
  referenceIndex: ReferenceIndex;
  sourceFile: ts.SourceFile;
  /** Base directory for advisory reference files. Rules can override with absolute paths. */
  referencesDir: string;
  report: (diag: Omit<Diagnostic, "file">) => void;
  /** Check if a specific sub-check is disabled via ruleId:subCheckId override */
  isSubCheckDisabled: (subCheckId: string) => boolean;
  /** Project overrides for this rule's tunable values (config `ruleOptions[ruleId]`).
   *  A rule reads `ctx.options.x ?? DEFAULT`, so no copy is needed to change a value. */
  options: Record<string, unknown>;
}

export type RuleCategory = "security" | "performance" | "quality" | "architecture";

export interface RuleMeta {
  severity?: Severity;
  category: RuleCategory;
  description: string;
  /** Number of sub-checks in this rule. Defaults to 1 for standalone rules. */
  subChecks?: number;
}

export interface RuleDefinition {
  id: string;
  meta: RuleMeta;
  severity: Severity;
  nodeTypes: ts.SyntaxKind[];
  check: (context: RuleContext) => void;
}

export interface EnhancedRuleContext extends RuleContext {
  walk: (callback: (node: ts.Node) => void) => void;
  reportAt: (node: ts.Node, message: string, advisory?: Advisory) => void;
  createFix: (node: ts.Node, newText: string) => TextChange;
  insertBefore: (node: ts.Node, text: string) => TextChange;
  insertAfter: (node: ts.Node, text: string) => TextChange;
  deleteNode: (node: ts.Node) => TextChange;
}

export interface DefineRuleOptions {
  meta: RuleMeta;
  /** SyntaxKind(s) this rule cares about. Empty = visit all nodes (universal). */
  nodeTypes?: ts.SyntaxKind[];
  check: (ctx: EnhancedRuleContext) => void;
}

export interface LintResult {
  diagnostics: Diagnostic[];
  fileCount: number;
  ruleCount: number;
  /** Total sub-checks across all rules (rules with subChecks > 1 count each sub-check) */
  checkCount: number;
  errorCount: number;
  warningCount: number;
  durationMs: number;
  fixableCount: number;
}

export interface CliOptions {
  path: string;
  /** Explicit config file (--config); when set, config-relative paths resolve from its directory. */
  configPath?: string;
  rules: string[];
  files: string[];
  changed: boolean;
  commit: boolean;
  branch: boolean;
  format: OutputFormat;
  noError: boolean;
  benchmark: boolean;
  fileThreshold: number;
  fix: boolean;
  dryRun: boolean;
  extract: boolean;
}

export interface RuleOverride {
  ruleId: string;
  severity: Severity | "off";
  /** Glob patterns to scope this override to specific files. If omitted, applies globally. */
  files?: string[];
}

export interface RuleGroup {
  /** Group id; a user entry with the same id overrides the built-in group's severity. */
  id: string;
  /** Severity applied to every member. "off" disables the whole rule (or sub-check). */
  severity: Severity | "off";
  /** Member ids: a plain rule id, or "ruleId:subCheckId" to target a single sub-check.
   *  Optional for a user entry that only re-sets a built-in group's severity. */
  rules?: string[];
}

export interface DlintConfig {
  /** Load the package's bundled universal rules. Defaults to true. */
  bundledRules?: boolean;
  /** Project-specific rules dir; additive, overrides a bundled rule with the same id. */
  rulesDir?: string;
  /** Default severity for all rules. Defaults to "error". */
  severity?: Severity;
  /** Override severity for specific rules by id (e.g. "r34") or filename. */
  overrides?: RuleOverride[];
  /** Named rule groups; toggle a whole set with one severity. Merged with the package's
   *  built-in groups by id (a user entry re-sets a built-in group's severity). */
  groups?: RuleGroup[];
  /** Per-rule tunable values, keyed by rule id, e.g.
   *  `{ "route-boundary": { allowedPairs: [["a","b"]] } }`. The rule reads them via
   *  `ctx.options`; lets a project change a value without copying the rule. */
  ruleOptions?: Record<string, Record<string, unknown>>;
  include?: string[];
  exclude?: string[];
  tsconfig?: string;
  /** Max file size in bytes. Files larger are skipped. Defaults to 500000. */
  maxFileSize?: number;
  /** Default directory for advisory reference files. Defaults to ".dlint/references". Rule overrides with absolute/custom paths take precedence. */
  referencesDir?: string;
  /** Directory for extractor definitions. Defaults to ".dlint/extractors". */
  extractorsDir?: string;
  /** Base branch for --branch diff comparison. Defaults to "origin/main". */
  baseBranch?: string;
  /** Pattern strings to tag in directive-gated functions. Plain string = exact call match, ^regex$ = pattern. */
  tags?: string[];
  /** File-level directive string that gates tag extraction (e.g. "use server", "use strict"). */
  directive?: string;
}

export interface TypeDeclarationMember {
  name: string;
  type: string;
  value?: string;
}

export interface TypeDeclaration {
  kind: DeclarationKind;
  name: string;
  filePath: string;
  line: number;
  isExported: boolean;
  members: readonly TypeDeclarationMember[];
  /** Return type string — only for kind: function */
  returnType?: string;
}

export interface ExtractorContext {
  program: ts.Program;
  checker: ts.TypeChecker;
  sourceFile: ts.SourceFile;
  tags: readonly string[];
  directive: string;
}

export interface ExtractorDefinition {
  id: string;
  name: string;
  extract: (ctx: ExtractorContext) => unknown[];
  /** Opaque at collection level — typed via defineExtractor<T> at authoring level */
  dashboard?: unknown;
}

export interface FunctionConsumption {
  name: string;
  filePath: string;
  line: number;
  callTargets: readonly { name: string; file: string }[];
  dbTables: readonly string[];
  bodyHash: string;
  tokenCount: number;
}

export interface DuplicationCandidate {
  funcA: { name: string; file: string; line: number };
  funcB: { name: string; file: string; line: number };
  score: number;
  sharedCalls: readonly string[];
  sharedTables: readonly string[];
  hashMatch: boolean;
}

export interface DeadExport {
  name: string;
  file: string;
  line: number;
  tokenCount: number;
}

export interface FunctionTag {
  functionName: string;
  filePath: string;
  tags: readonly string[];
  returnType: string;
  callsExports: readonly string[];
}

export interface ExtractResult {
  extractors: Record<string, { items: readonly unknown[]; count: number }>;
  fileCount: number;
  durationMs: number;
}

export interface ComplexityMetrics {
  functionName: string;
  filePath: string;
  lineStart: number;
  lineCount: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  maxNestingDepth: number;
  parameterCount: number;
  helperFunctionCount: number;
  branchCount: number;
}

export interface ScoreDefinition<T = unknown> {
  label: string;
  count: (items: readonly T[]) => number;
  total: (items: readonly T[]) => number;
  source: string;
}

export interface GapDefinition<T = unknown> {
  condition: (item: T) => boolean;
  severity: GapSeverity;
  issue: string | ((item: T) => string);
  fixHint: string;
}

export interface NodeViewConfig<T = unknown> {
  label: (item: T) => string;
  group: (item: T) => string;
  color: (item: T) => string;
  badges: (item: T) => readonly { text: string; type: string }[];
  detail: (item: T) => Record<string, string>;
  filePath: (item: T) => string;
}

export interface DashboardAdapter<T = unknown> {
  scores?: readonly ScoreDefinition<T>[];
  gaps?: readonly GapDefinition<T>[];
  nodeView?: NodeViewConfig<T>;
}
