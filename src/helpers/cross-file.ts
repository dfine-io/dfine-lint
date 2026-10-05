import ts from "typescript";
import { resolveCallee } from "./detection.js";

const callBodyCache = new WeakMap<ts.Symbol, ts.Block | null>();
const resolutionCaches = new WeakMap<ts.Program, ts.ModuleResolutionCache>();
const valueImportCaches = new WeakMap<ts.Program, WeakMap<ts.SourceFile, readonly ts.StringLiteral[]>>();

/** Resolve an import specifier the way its program does (resolution mode included), sharing one cache per program */
export function resolveImportedModule(program: ts.Program, specifier: ts.StringLiteralLike): ts.ResolvedModuleFull | undefined {
  const options = program.getCompilerOptions();
  let cache = resolutionCaches.get(program);
  if (!cache) {
    const caseSensitive = ts.sys.useCaseSensitiveFileNames;
    cache = ts.createModuleResolutionCache(program.getCurrentDirectory(), (f) => (caseSensitive ? f : f.toLowerCase()), options);
    resolutionCaches.set(program, cache);
  }
  const sf = specifier.getSourceFile();
  const mode = program.getModeForUsageLocation(sf, specifier);
  return ts.resolveModuleName(specifier.text, sf.fileName, options, ts.sys, cache, undefined, mode).resolvedModule;
}

/** True when an import or re-export loads nothing at runtime: `import type`, or, unless verbatimModuleSyntax keeps it, only `type` specifiers and no default */
export function isTypeOnlyImport(node: ts.ImportDeclaration | ts.ExportDeclaration, options: ts.CompilerOptions): boolean {
  if (ts.isExportDeclaration(node)) {
    const named = node.exportClause;
    return node.isTypeOnly || (!options.verbatimModuleSyntax && !!named && ts.isNamedExports(named) && named.elements.every((el) => el.isTypeOnly));
  }
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
  if (clause.name || options.verbatimModuleSyntax) return false;
  const bindings = clause.namedBindings;
  return !!bindings && ts.isNamedImports(bindings) && bindings.elements.every((el) => el.isTypeOnly);
}

/** Module specifiers a file loads at runtime under its program's options: value imports, value re-exports and import("x") calls */
export function collectValueImports(program: ts.Program, sf: ts.SourceFile): readonly ts.StringLiteral[] {
  let cache = valueImportCaches.get(program);
  if (!cache) {
    cache = new WeakMap();
    valueImportCaches.set(program, cache);
  }
  const cached = cache.get(sf);
  if (cached) return cached;
  const options = program.getCompilerOptions();
  const literals: ts.StringLiteral[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !isTypeOnlyImport(node, options)) {
      literals.push(node.moduleSpecifier);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteral(arg)) literals.push(arg);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  cache.set(sf, literals);
  return literals;
}

function extractBody(decl: ts.Declaration): ts.Block | null {
  if (ts.isFunctionDeclaration(decl) && decl.body) return decl.body;
  if (ts.isMethodDeclaration(decl) && decl.body) return decl.body;
  if (ts.isArrowFunction(decl) && ts.isBlock(decl.body)) return decl.body;
  if (ts.isFunctionExpression(decl) && decl.body) return decl.body;
  if (ts.isVariableDeclaration(decl) && decl.initializer) {
    if (ts.isArrowFunction(decl.initializer) && ts.isBlock(decl.initializer.body))
      return decl.initializer.body;
    if (ts.isFunctionExpression(decl.initializer))
      return decl.initializer.body;
  }
  return null;
}

/** Resolve a call expression to its target function body (cross-file via symbol resolution) */
export function resolveCallBody(
  checker: ts.TypeChecker,
  callExpr: ts.CallExpression
): ts.Block | null {
  const resolved = resolveCallee(callExpr, checker)?.symbol;
  if (!resolved) return null;
  const cached = callBodyCache.get(resolved);
  if (cached !== undefined) return cached;
  // Overloads list their bodyless signatures first: the first declaration with a body wins
  const body = (resolved.declarations ?? []).map((d) => extractBody(d)).find((b) => b !== null) ?? null;
  callBodyCache.set(resolved, body);
  return body;
}

/** Check if a function body calls any of the given names. @deprecated It matches spellings: walk the body with resolveCallee instead; removed in 2.0. */
export function bodyContainsCall(body: ts.Node, ...names: readonly string[]): boolean {
  const nameSet = new Set(names);
  let found = false;
  function visit(node: ts.Node): void {
    if (found) return;
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && nameSet.has(node.expression.text)) {
        found = true;
        return;
      }
      if (ts.isPropertyAccessExpression(node.expression) &&
          nameSet.has(node.expression.name.text)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(body);
  return found;
}
