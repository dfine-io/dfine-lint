import ts from "typescript";

const callBodyCache = new WeakMap<ts.Symbol, ts.Block | null>();

function extractBody(symbol: ts.Symbol): ts.Block | null {
  const decl = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (!decl) return null;
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
  const ident = ts.isPropertyAccessExpression(callExpr.expression)
    ? callExpr.expression.name
    : callExpr.expression;
  const symbol = checker.getSymbolAtLocation(ident);
  if (!symbol) return null;
  const resolved = symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
  const cached = callBodyCache.get(resolved);
  if (cached !== undefined) return cached;
  const body = extractBody(resolved);
  callBodyCache.set(resolved, body);
  return body;
}

/** Check if a function body contains a call to any of the given function names */
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
