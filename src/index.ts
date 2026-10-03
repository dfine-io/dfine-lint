export type {
  RuleDefinition,
  RuleOverride,
  RuleMeta,
  RuleCategory,
  Severity,
  DlintConfig,
  DefineRuleOptions,
  LintResult,
  CliOptions,
  TextChange,
  ExtractorDefinition,
  ExtractorContext,
  FunctionTag,
  ExtractResult,
  ComplexityMetrics,
  FunctionConsumption,
  DuplicationCandidate,
  DeadExport,
  DashboardAdapter,
  ScoreDefinition,
  GapDefinition,
  NodeViewConfig,
  TypeDeclarationMember,
  TypeDeclaration,
  ReferenceIndex,
  LintTimings,
} from "./types.js";
export {
  hasDirective,
  getExportedFunctions,
} from "./core/program.js";
export type { ExportedFunction } from "./core/program.js";
export { defineRule } from "./helpers/define-rule.js";
export { defineExtractor } from "./helpers/define-extractor.js";
export {
  isLibDeclaration,
  isNodeModulesDeclaration,
  isInConditionalBranch,
  isInBooleanContext,
  isInsideLoop,
  isNullableType,
  hasOwnToString,
  isStringType,
  resolveSymbol,
  hasJsDocTag,
  isAssignableTo,
  unwrapPromiseType,
  isBuiltinCollection,
  isThenable,
  isWriteTarget,
  valueSymbolOf,
  isSameReference,
} from "./helpers/ast.js";
export {
  dbRootMethod,
  isDbCall,
  returnTypeHasProperties,
  isFromPackage,
} from "./helpers/detection.js";
export {
  resolveCallBody,
  bodyContainsCall,
  resolveImportedModule,
  isTypeOnlyImport,
  collectValueImports,
} from "./helpers/cross-file.js";
export { tokenizeFile, tokenSimilarity } from "./clone/index.js";
export type { TokenizedBlock } from "./clone/index.js";
export {
  collectTypeDeclarations,
  collectFunctionSignatures,
  memberJaccard,
  signatureKey,
} from "./helpers/domain.js";
export { buildReferenceIndex } from "./core/reference-index.js";
