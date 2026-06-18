import ts from "typescript";

// === Semantic Utility Functions (Compiler API) ===

/** Check if symbol declaration originates from lib.*.d.ts (DOM, ES builtins) */
export function isLibDeclaration(symbol: ts.Symbol): boolean {
  const decl = symbol.declarations?.[0];
  if (!decl) return false;
  return /\/lib\..+\.d\.ts$/.test(decl.getSourceFile().fileName);
}

/** Check if symbol declaration originates from node_modules */
export function isNodeModulesDeclaration(symbol: ts.Symbol): boolean {
  const decl = symbol.declarations?.[0];
  if (!decl) return false;
  return decl.getSourceFile().fileName.includes("node_modules");
}

/** Check if a node is inside a conditional branch (ternary expression) */
export function isInConditionalBranch(node: ts.Node): boolean {
  let current = node.parent;
  while (current) {
    if (ts.isConditionalExpression(current)) return true;
    if (ts.isBlock(current) || ts.isSourceFile(current)) break;
    current = current.parent;
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

/** Check if node is inside a loop (for/for-in/for-of/while/do-while). Stops at function boundaries. */
export function isInsideLoop(node: ts.Node): boolean {
  let current = node.parent;
  while (current) {
    if (
      ts.isForStatement(current) ||
      ts.isForInStatement(current) ||
      ts.isForOfStatement(current) ||
      ts.isWhileStatement(current) ||
      ts.isDoStatement(current)
    )
      return true;
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current) ||
      ts.isMethodDeclaration(current)
    )
      break;
    current = current.parent;
  }
  return false;
}

/** Check if type includes null or undefined */
export function isNullableType(type: ts.Type): boolean {
  if (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) return true;
  if (type.isUnion())
    return type.types.some(
      (t) => t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined),
    );
  return false;
}

const TOSTRING_SAFE_FLAGS =
  ts.TypeFlags.String |
  ts.TypeFlags.StringLiteral |
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
  ts.TypeFlags.TemplateLiteral |
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
  return sym.declarations.some(
    (d) => !d.getSourceFile().fileName.includes("lib.es"),
  );
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

/** Structural type assignability check (augmented in typechecker-augment.d.ts) */
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

/** Check if type is a built-in collection (Array, Map, Set, WeakMap, WeakSet, Promise) */
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
  return ["Map", "Set", "WeakMap", "WeakSet", "Promise"].includes(
    collectionSym.name,
  );
}
