import ts from "typescript";
import { basename, dirname } from "node:path";
import { TS_LIB_DIR } from "../core/constants.js";

// === Semantic Utility Functions (Compiler API) ===

// File name of a TypeScript lib.*.d.ts file, or undefined for any other file (typescript.d.ts shares the directory)
function tsLibFileName(fileName: string): string | undefined {
  const name = basename(fileName);
  return dirname(fileName) === TS_LIB_DIR && name.startsWith("lib.") ? name : undefined;
}

// Package name of a node_modules path; @types/scope__name maps back to @scope/name
export function packageOfFile(fileName: string): string | undefined {
  const at = fileName.lastIndexOf("/node_modules/");
  if (at < 0) return undefined;
  const [first, second] = fileName.slice(at + "/node_modules/".length).split("/");
  const name = first?.startsWith("@") ? `${first}/${second}` : first;
  if (!name?.startsWith("@types/")) return name;
  const typed = name.slice("@types/".length);
  return typed.includes("__") ? `@${typed.replace("__", "/")}` : typed;
}

/** Check if symbol declaration originates from TypeScript's own lib.*.d.ts (DOM, ES builtins) */
export function isLibDeclaration(symbol: ts.Symbol): boolean {
  const decl = symbol.declarations?.[0];
  if (!decl) return false;
  return tsLibFileName(decl.getSourceFile().fileName) !== undefined;
}

/** Check if symbol declaration originates from node_modules */
export function isNodeModulesDeclaration(symbol: ts.Symbol): boolean {
  const decl = symbol.declarations?.[0];
  if (!decl) return false;
  return packageOfFile(decl.getSourceFile().fileName) !== undefined;
}

/** Check if a node lies in an if/else or ternary branch, not the condition. Stops at function boundaries. */
export function isInConditionalBranch(node: ts.Node): boolean {
  let child = node;
  for (let current = node.parent; current && !ts.isFunctionLike(current); current = current.parent) {
    if (ts.isIfStatement(current) && child !== current.expression) return true;
    if (ts.isConditionalExpression(current) && child !== current.condition) return true;
    child = current;
  }
  return false;
}

/** Check if an expression is in a boolean context (if/while/for/ternary condition) */
export function isInBooleanContext(node: ts.Node): boolean {
  let current: ts.Node = node;
  while (current.parent) {
    const parent = current.parent;
    if (ts.isIfStatement(parent) && parent.expression === current) return true;
    if (ts.isWhileStatement(parent) && parent.expression === current)
      return true;
    if (ts.isDoStatement(parent) && parent.expression === current) return true;
    if (ts.isForStatement(parent) && parent.condition === current) return true;
    if (ts.isConditionalExpression(parent) && parent.condition === current)
      return true;
    if (
      ts.isBinaryExpression(parent) &&
      (parent.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
    ) {
      current = parent;
      continue;
    }
    if (
      ts.isPrefixUnaryExpression(parent) &&
      parent.operator === ts.SyntaxKind.ExclamationToken
    ) {
      current = parent;
      continue;
    }
    if (ts.isParenthesizedExpression(parent)) {
      current = parent;
      continue;
    }
    return false;
  }
  return false;
}

/** True when an expression is written: assigned (also as a destructuring element or a for-in/of head), incremented, decremented or deleted */
export function isWriteTarget(node: ts.Expression): boolean {
  let target: ts.Node = node;
  while (ts.isParenthesizedExpression(target.parent)) target = target.parent;
  const direct = target.parent;
  if (ts.isPrefixUnaryExpression(direct) || ts.isPostfixUnaryExpression(direct)) {
    return direct.operator === ts.SyntaxKind.PlusPlusToken || direct.operator === ts.SyntaxKind.MinusMinusToken;
  }
  if (ts.isDeleteExpression(direct)) return true;
  // An element of an array or object literal is written only when the literal itself is a target
  while (
    ts.isParenthesizedExpression(target.parent) || ts.isArrayLiteralExpression(target.parent) || ts.isObjectLiteralExpression(target.parent) ||
    ts.isSpreadElement(target.parent) || ts.isSpreadAssignment(target.parent) ||
    (ts.isShorthandPropertyAssignment(target.parent) && target.parent.name === target) ||
    (ts.isPropertyAssignment(target.parent) && target.parent.initializer === target)
  ) target = target.parent;
  const parent = target.parent;
  if (ts.isBinaryExpression(parent)) {
    return parent.left === target && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
  }
  return (ts.isForInStatement(parent) || ts.isForOfStatement(parent)) && parent.initializer === target;
}

/** The variable an identifier names; in a shorthand property `{ a }` that is the variable a, not the property */
export function valueSymbolOf(node: ts.Identifier, checker: ts.TypeChecker): ts.Symbol | undefined {
  return ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
    ? checker.getShorthandAssignmentValueSymbol(node.parent)
    : checker.getSymbolAtLocation(node);
}

/** True when two expressions name the same thing: identifiers, property chains, element access with the same key, `this` */
export function isSameReference(a: ts.Expression, b: ts.Expression, checker: ts.TypeChecker): boolean {
  // (obj).x names obj.x: parentheses never change what an expression refers to
  if (ts.isParenthesizedExpression(a)) return isSameReference(a.expression, b, checker);
  if (ts.isParenthesizedExpression(b)) return isSameReference(a, b.expression, checker);
  if (ts.isIdentifier(a) && ts.isIdentifier(b)) {
    const symA = valueSymbolOf(a, checker);
    return !!symA && symA === valueSymbolOf(b, checker);
  }
  if (ts.isPropertyAccessExpression(a) && ts.isPropertyAccessExpression(b)) {
    const symA = checker.getSymbolAtLocation(a.name);
    const symB = checker.getSymbolAtLocation(b.name);
    // On an any receiver neither name has a symbol: the same name on the same receiver still names the same thing
    const sameName = symA || symB ? symA === symB : a.name.text === b.name.text;
    return sameName && isSameReference(a.expression, b.expression, checker);
  }
  if (ts.isElementAccessExpression(a) && ts.isElementAccessExpression(b)) {
    const keyA = a.argumentExpression;
    const keyB = b.argumentExpression;
    // a[0] and a["0"] name one element: a string or numeric key compares by its text
    const textA = ts.isStringLiteralLike(keyA) || ts.isNumericLiteral(keyA) ? keyA.text : undefined;
    const textB = ts.isStringLiteralLike(keyB) || ts.isNumericLiteral(keyB) ? keyB.text : undefined;
    const sameKey = textA !== undefined || textB !== undefined ? textA === textB : isSameReference(keyA, keyB, checker);
    return sameKey && isSameReference(a.expression, b.expression, checker);
  }
  return a.kind === ts.SyntaxKind.ThisKeyword && b.kind === ts.SyntaxKind.ThisKeyword;
}

/** Check if node runs per loop iteration: body, condition or update, not a once-run header. Stops at function boundaries. */
export function isInsideLoop(node: ts.Node): boolean {
  let child = node;
  for (let current = node.parent; current && !ts.isFunctionLike(current); current = current.parent) {
    if (ts.isForStatement(current) && child !== current.initializer) return true;
    if ((ts.isForInStatement(current) || ts.isForOfStatement(current)) && child !== current.expression) return true;
    if (ts.isWhileStatement(current) || ts.isDoStatement(current)) return true;
    child = current;
  }
  return false;
}

/** Check if type includes null or undefined; a type parameter answers through its constraint */
export function isNullableType(type: ts.Type): boolean {
  if (type.flags & ts.TypeFlags.TypeParameter) {
    const constraint = type.getConstraint();
    return !!constraint && isNullableType(constraint);
  }
  if (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) return true;
  return type.isUnion() && type.types.some((t) => isNullableType(t));
}

/** True for a string type: string, a string or template literal, a string mapping like Uppercase<string>, or a union of these */
export function isStringType(type: ts.Type): boolean {
  if (type.flags & ts.TypeFlags.StringLike) return true;
  return type.isUnion() && type.types.every(isStringType);
}

const TOSTRING_SAFE_FLAGS =
  ts.TypeFlags.StringLike |
  ts.TypeFlags.Number |
  ts.TypeFlags.NumberLiteral |
  ts.TypeFlags.Boolean |
  ts.TypeFlags.BooleanLiteral |
  ts.TypeFlags.BigInt |
  ts.TypeFlags.BigIntLiteral |
  ts.TypeFlags.Null |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Any |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.EnumLiteral;

/** Check if type has own toString() (not inherited from Object.prototype) */
export function hasOwnToString(
  type: ts.Type,
  checker: ts.TypeChecker,
): boolean {
  if (type.flags & TOSTRING_SAFE_FLAGS) return true;
  if (type.flags & ts.TypeFlags.TypeParameter) {
    const constraint = checker.getBaseConstraintOfType(type);
    if (constraint) return hasOwnToString(constraint, checker);
    return false;
  }
  if (checker.isArrayType(type)) return true;
  // A1 FIX: verify built-in Date/RegExp/Error via isLibDeclaration (not name-only)
  const typeSym = type.getSymbol();
  if (
    typeSym &&
    isLibDeclaration(typeSym) &&
    (typeSym.name === "Date" ||
      typeSym.name === "RegExp" ||
      typeSym.name === "Error")
  )
    return true;
  if (type.isUnion())
    return type.types.every((t) => hasOwnToString(t, checker));
  if (type.isIntersection())
    return type.types.some((t) => hasOwnToString(t, checker));
  const sym = type.getProperty("toString");
  if (!sym?.declarations?.length) return false;
  // Object.prototype.toString is declared in TypeScript's ES lib files; any other declaration is the type's own
  return sym.declarations.some((d) => !tsLibFileName(d.getSourceFile().fileName)?.startsWith("lib.es"));
}

// === Symbol Resolution ===

/** Resolve alias symbol to its original target. Returns unchanged if not alias. */
export function resolveSymbol(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
): ts.Symbol {
  if (symbol.flags & ts.SymbolFlags.Alias) {
    return checker.getAliasedSymbol(symbol);
  }
  return symbol;
}

/** Check if a symbol has any of the given JSDoc tags */
export function hasJsDocTag(symbol: ts.Symbol, ...tagNames: readonly string[]): boolean {
  return symbol.getJsDocTags().some((tag) => tagNames.includes(tag.name));
}

// === Type Comparison ===

/** Structural type assignability check */
export function isAssignableTo(
  checker: ts.TypeChecker,
  source: ts.Type,
  target: ts.Type,
): boolean {
  return checker.isTypeAssignableTo(source, target);
}

/** Unwrap Promise<T> to T via native getAwaitedType (handles nested Promises, PromiseLike, thenables) */
export function unwrapPromiseType(
  type: ts.Type,
  checker: ts.TypeChecker,
): ts.Type {
  return checker.getAwaitedType(type) ?? type;
}

/** True when the type is thenable: it has a callable `then`, or a member of its union or intersection does */
export function isThenable(type: ts.Type, checker: ts.TypeChecker): boolean {
  const thenProp = type.getProperty("then");
  if (thenProp && checker.getTypeOfSymbol(thenProp).getCallSignatures().length > 0) return true;
  return type.isUnionOrIntersection() && type.types.some((t) => isThenable(t, checker));
}

/** Check if type is a built-in collection (Array, Map, Set, their readonly forms, WeakMap, WeakSet, Promise) */
export function isBuiltinCollection(
  type: ts.Type,
  checker: ts.TypeChecker,
): boolean {
  if (checker.isArrayType(type)) return true;
  // Branded intersections (readonly T[] & { __brand }) — recurse into intersection members
  if (type.isIntersection()) {
    return (type).types.some((t) =>
      isBuiltinCollection(t, checker),
    );
  }
  // A2 FIX: verify collection symbol is from lib.d.ts (not name-only)
  const collectionSym = type.getSymbol();
  if (!collectionSym || !isLibDeclaration(collectionSym)) return false;
  return ["Map", "Set", "ReadonlyMap", "ReadonlySet", "WeakMap", "WeakSet", "Promise"].includes(
    collectionSym.name,
  );
}
