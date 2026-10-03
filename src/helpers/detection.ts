// detection.ts — Generic structural detection primitives for the dlint SDK
// Zero convention-specific logic. Zero ORM knowledge. All checks use TypeChecker.
import ts from "typescript";
import { unwrapPromiseType, resolveSymbol, packageOfFile } from "./ast.js";

/** TypeChecker: walk the call chain to the stored DB handle (db, this.db, ctx.db); return the method called on it */
export function dbRootMethod(
  node: ts.Expression,
  checker: ts.TypeChecker,
  methods: readonly string[]
): string | null {
  if (ts.isPropertyAccessExpression(node)) {
    // A call result (a query builder) is never the handle: only stored receivers are type-checked
    if (!ts.isCallExpression(node.expression)) {
      const type = checker.getTypeAtLocation(node.expression);
      if (methods.every((m) => type.getProperty(m) !== undefined)) return node.name.text;
    }
    return dbRootMethod(node.expression, checker, methods);
  }
  if (ts.isCallExpression(node)) return dbRootMethod(node.expression, checker, methods);
  return null;
}

/** TypeChecker: the call chain reaches a stored receiver whose type has all specified methods */
export function isDbCall(
  node: ts.Expression,
  checker: ts.TypeChecker,
  methods: readonly string[]
): boolean {
  return dbRootMethod(node, checker, methods) !== null;
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

// Name of the ambient `declare module "x"` block around a declaration outside node_modules
function ambientModuleName(decl: ts.Node): string | undefined {
  for (let n = decl.parent; n; n = n.parent) {
    if (ts.isModuleDeclaration(n) && ts.isStringLiteral(n.name)) return n.name.text;
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
  if (!sym) return false;
  const resolved = resolveSymbol(checker, sym);
  const decls = resolved.declarations;
  if (!decls || decls.length === 0) return false;
  return decls.some((d) => {
    const pkg = packageOfFile(d.getSourceFile().fileName);
    if (pkg !== undefined) return pkg === packageName;
    const mod = ambientModuleName(d);
    return mod === packageName || mod?.startsWith(`${packageName}/`) === true;
  });
}
