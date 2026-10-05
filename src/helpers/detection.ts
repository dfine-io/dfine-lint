// detection.ts — Generic structural detection primitives for the dlint SDK
// Zero ORM knowledge: a caller names the package. Identity comes from symbols and their declarations.
import ts from "typescript";
import { unwrapPromiseType, resolveSymbol, packageOfFile, packageNameOf, isLibDeclaration, classOrInterfaceOf } from "./ast.js";

// Package a declaration belongs to: its node_modules path, else the `declare module "pkg"` shim around it
function declarationPackage(decl: ts.Node): string | undefined {
  const pkg = packageOfFile(decl.getSourceFile().fileName);
  if (pkg !== undefined) return pkg;
  const name = ambientModuleName(decl);
  // A relative augmentation (declare module "./store") extends project code, not a package
  return name === undefined || ts.isExternalModuleNameRelative(name) ? undefined : packageNameOf(name);
}

function declaredInPackage(sym: ts.Symbol | undefined, packageName: string): boolean {
  return sym?.declarations?.some((d) => declarationPackage(d) === packageName) ?? false;
}

/** TypeChecker: the type, its alias, a union or intersection member, or a base class is declared in the npm package */
export function isTypeFromPackage(type: ts.Type, checker: ts.TypeChecker, packageName: string): boolean {
  if (type.isUnionOrIntersection()) return type.types.some((t) => isTypeFromPackage(t, checker, packageName));
  // A project alias (type DB = NodePgDatabase<S>) keeps the package type underneath
  if (declaredInPackage(type.aliasSymbol, packageName) || declaredInPackage(type.getSymbol(), packageName)) return true;
  const declared = classOrInterfaceOf(type);
  return !!declared && checker.getBaseTypes(declared).some((base) => isTypeFromPackage(base, checker, packageName));
}

/** TypeChecker: walk the call chain to the stored DB handle (db, this.db, ctx.db); return the method called on it; with packageName the handle's type must come from that package */
export function dbRootMethod(
  node: ts.Expression,
  checker: ts.TypeChecker,
  methods: readonly string[],
  packageName?: string
): string | null {
  if (ts.isPropertyAccessExpression(node)) {
    // A call result (a query builder) is never the handle: only stored receivers are type-checked
    if (!ts.isCallExpression(node.expression)) {
      const type = checker.getTypeAtLocation(node.expression);
      const fromPackage = packageName === undefined || isTypeFromPackage(type, checker, packageName);
      if (fromPackage && methods.every((m) => type.getProperty(m) !== undefined)) return node.name.text;
    }
    return dbRootMethod(node.expression, checker, methods, packageName);
  }
  if (ts.isCallExpression(node)) return dbRootMethod(node.expression, checker, methods, packageName);
  return null;
}

/** TypeChecker: the call chain reaches a stored receiver whose type has all specified methods (from packageName, if given) */
export function isDbCall(
  node: ts.Expression,
  checker: ts.TypeChecker,
  methods: readonly string[],
  packageName?: string
): boolean {
  return dbRootMethod(node, checker, methods, packageName) !== null;
}

/** TypeChecker: call return type (unwrapped from Promise) has all specified properties */
export function returnTypeHasProperties(
  node: ts.CallExpression,
  checker: ts.TypeChecker,
  properties: readonly string[]
): boolean {
  const callType = checker.getTypeAtLocation(node);
  const innerType = unwrapPromiseType(callType, checker);
  const hasAll = (t: ts.Type): boolean => properties.every((p) => t.getProperty(p) !== undefined);
  return innerType.isUnion() ? innerType.types.some(hasAll) : hasAll(innerType);
}

// Name of the ambient `declare module "x"` block around a declaration; "node:fs" and "fs" name one builtin
function ambientModuleName(decl: ts.Node): string | undefined {
  for (let n = decl.parent; n; n = n.parent) {
    if (ts.isModuleDeclaration(n) && ts.isStringLiteral(n.name)) return n.name.text.replace(/^node:/, "");
  }
  return undefined;
}

/** TypeChecker: verify identifier resolves into a specific npm package (path-exact, or its ambient module) */
export function isFromPackage(
  identifier: ts.Identifier,
  checker: ts.TypeChecker,
  packageName: string
): boolean {
  const sym = checker.getSymbolAtLocation(identifier);
  return !!sym && declaredInPackage(resolveSymbol(checker, sym), packageName);
}

/** The function a call, `new` or tagged template invokes, through aliases and member access */
export interface ResolvedCallee {
  /** The alias-resolved symbol: `import { useState as s }` and `React.useState` both reach react's useState */
  readonly symbol: ts.Symbol;
  /** The declared name, never the local spelling; a default export reads its declaration's name */
  readonly name: string;
  /** Declared in TypeScript's lib (globals such as setTimeout, RegExp, fetch under DOM) */
  readonly lib: boolean;
  /** npm package of a declaration, or of the `declare module` shim around it; undefined for project code and the TS lib */
  readonly packageName: string | undefined;
  /** Ambient module of that declaration in @types/node style typings, e.g. "fs"; the node: scheme is dropped */
  readonly moduleName: string | undefined;
  /** A top-level global of the lib or a package (script .d.ts, `declare global`); members and project code are not */
  readonly global: boolean;
}

// A top-level declaration of a script file (the TS lib, a global .d.ts) or of a `declare global` block
function isGlobalDeclaration(decl: ts.Node): boolean {
  // A module symbol is declared by its file, which has no parent scope
  if (ts.isSourceFile(decl)) return false;
  const statement = ts.isVariableDeclaration(decl) ? decl.parent.parent : decl;
  const scope = statement.parent;
  if (ts.isSourceFile(scope)) return !ts.isExternalModule(scope);
  return ts.isModuleBlock(scope) && (scope.parent.flags & ts.NodeFlags.GlobalAugmentation) !== 0;
}

// A default export's symbol is named "default": take the declaration's own name, else the local spelling
function declaredName(symbol: ts.Symbol, local: ts.MemberName): string {
  if (symbol.name !== ts.InternalSymbolName.Default) return symbol.name;
  const first = symbol.declarations?.[0];
  const declared = first && ts.getNameOfDeclaration(first);
  return declared && ts.isIdentifier(declared) ? declared.text : local.text;
}

function computeCallee(node: ts.CallExpression | ts.NewExpression | ts.TaggedTemplateExpression, checker: ts.TypeChecker): ResolvedCallee | undefined {
  const target = ts.isTaggedTemplateExpression(node) ? node.tag : node.expression;
  let nameNode: ts.MemberName;
  if (ts.isPropertyAccessExpression(target)) nameNode = target.name;
  else if (ts.isIdentifier(target)) nameNode = target;
  else return undefined;
  const sym = checker.getSymbolAtLocation(nameNode);
  if (!sym) return undefined;
  const symbol = resolveSymbol(checker, sym);
  const decls = symbol.declarations ?? [];
  const lib = isLibDeclaration(symbol);
  // Every declaration counts, augmentations included: the first one in a package names it
  let packageDecl: ts.Declaration | undefined;
  let packageName: string | undefined;
  for (const d of lib ? [] : decls) {
    packageName = declarationPackage(d);
    if (packageName !== undefined) {
      packageDecl = d;
      break;
    }
  }
  return {
    symbol,
    name: declaredName(symbol, nameNode),
    lib,
    packageName,
    // Typings declare a builtin under "fs" or "node:fs" and re-export the other; both read "fs"
    moduleName: packageDecl && ambientModuleName(packageDecl),
    global: (lib || packageName !== undefined) && decls.some(isGlobalDeclaration),
  };
}

const calleeCache = new WeakMap<ts.TypeChecker, WeakMap<ts.Node, ResolvedCallee | null>>();

/** TypeChecker: resolve what a call invokes, once per node; a name or path string never decides it */
export function resolveCallee(
  node: ts.CallExpression | ts.NewExpression | ts.TaggedTemplateExpression,
  checker: ts.TypeChecker
): ResolvedCallee | undefined {
  let cache = calleeCache.get(checker);
  if (!cache) {
    cache = new WeakMap();
    calleeCache.set(checker, cache);
  }
  const cached = cache.get(node);
  if (cached !== undefined) return cached ?? undefined;
  const callee = computeCallee(node, checker);
  cache.set(node, callee ?? null);
  return callee;
}
