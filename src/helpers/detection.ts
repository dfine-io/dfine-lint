// detection.ts — Generic structural detection primitives for the dlint SDK
// Zero convention-specific logic. Zero ORM knowledge. All checks use TypeChecker.
import ts from "typescript";
import { unwrapPromiseType, resolveSymbol } from "./ast.js";

/** TypeChecker: walk call chain to root, verify root type has all specified methods */
export function isDbCall(
  node: ts.Expression,
  checker: ts.TypeChecker,
  methods: readonly string[]
): boolean {
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    const type = checker.getTypeAtLocation(node.expression);
    if (methods.every((m) => type.getProperty(m) !== undefined)) return true;
  }
  if (ts.isCallExpression(node)) return isDbCall(node.expression, checker, methods);
  if (ts.isPropertyAccessExpression(node)) return isDbCall(node.expression, checker, methods);
  return false;
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

/** TypeChecker: verify identifier resolves to a specific node_modules package */
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
  return decls.some((d) => d.getSourceFile().fileName.includes(`/${packageName}/`));
}
