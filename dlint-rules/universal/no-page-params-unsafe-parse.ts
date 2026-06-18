// Blocks `Schema.parse(x)` in Next.js Page/Layout Components when `x` originates
// from the `params` or `searchParams` destructuring -- those are URL trust boundaries
// and `.parse()` throws on invalid input, crashing the page (500) instead of routing
// to notFound() (404). Use a safe-parse helper that calls notFound() on failure
// instead of Schema.parse().
//
// Detection is 100% TypeChecker + Compiler API:
//   1. Is default export function a Next.js Page? -> Props type has `params` or
//      `searchParams` property (Symbol-based getProperty, no string match on source).
//   2. Is receiver a Zod schema? -> Type has both `parse` and `safeParse` methods
//      (structural shape match via TypeChecker, no name heuristic).
//   3. Does arg originate from page params binding? -> Recursive Symbol resolution
//      through VariableDeclaration initializers, BindingElement parent walks, and
//      Promise.all([params, searchParams]) array destructuring -- transitive closure
//      from arg Identifier back to the page-function param Symbol.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

function isNextJsPageFunction(fn: ts.FunctionLikeDeclaration, checker: ts.TypeChecker): boolean {
  if (fn.parameters.length === 0) return false;
  const propsParam = fn.parameters[0];
  if (!propsParam) return false;
  const propsType = checker.getTypeAtLocation(propsParam);
  return !!propsType.getProperty("params") || !!propsType.getProperty("searchParams");
}

function collectPageParamSymbols(
  propsParam: ts.ParameterDeclaration,
  checker: ts.TypeChecker,
): Set<ts.Symbol> {
  const symbols = new Set<ts.Symbol>();
  if (!ts.isObjectBindingPattern(propsParam.name)) return symbols;
  for (const element of propsParam.name.elements) {
    if (!ts.isIdentifier(element.name)) continue;
    const propName =
      element.propertyName && ts.isIdentifier(element.propertyName)
        ? element.propertyName.text
        : element.name.text;
    if (propName !== "params" && propName !== "searchParams") continue;
    const sym = checker.getSymbolAtLocation(element.name);
    if (sym) symbols.add(sym);
  }
  return symbols;
}

function isZodSchemaReceiver(receiver: ts.Expression, checker: ts.TypeChecker): boolean {
  const type = checker.getTypeAtLocation(receiver);
  return !!type.getProperty("parse") && !!type.getProperty("safeParse");
}

function unwrapExpression(node: ts.Node): ts.Node {
  let current: ts.Node = node;
  while (true) {
    if (ts.isPropertyAccessExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isElementAccessExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isAwaitExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isParenthesizedExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isNonNullExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current)) {
      current = current.expression;
      continue;
    }
    break;
  }
  return current;
}

function expressionOriginatesFromParams(
  expr: ts.Expression,
  checker: ts.TypeChecker,
  paramSymbols: Set<ts.Symbol>,
  visited: Set<ts.Symbol>,
): boolean {
  const unwrapped = unwrapExpression(expr);
  // Promise.all([params, searchParams]) -> any element from paramSymbols counts
  if (ts.isCallExpression(unwrapped)) {
    if (
      ts.isPropertyAccessExpression(unwrapped.expression) &&
      unwrapped.expression.name.text === "all"
    ) {
      for (const callArg of unwrapped.arguments) {
        if (ts.isArrayLiteralExpression(callArg)) {
          for (const element of callArg.elements) {
            if (expressionOriginatesFromParams(element, checker, paramSymbols, visited)) return true;
          }
        }
      }
    }
    return false;
  }
  if (!ts.isIdentifier(unwrapped)) return false;
  const sym = checker.getSymbolAtLocation(unwrapped);
  return sym ? symbolOriginatesFromParams(sym, checker, paramSymbols, visited) : false;
}

function symbolOriginatesFromParams(
  sym: ts.Symbol,
  checker: ts.TypeChecker,
  paramSymbols: Set<ts.Symbol>,
  visited: Set<ts.Symbol>,
): boolean {
  if (paramSymbols.has(sym)) return true;
  if (visited.has(sym)) return false;
  visited.add(sym);

  const decl = sym.valueDeclaration;
  if (!decl) return false;

  // const x = <initializer>
  if (ts.isVariableDeclaration(decl) && decl.initializer) {
    return expressionOriginatesFromParams(decl.initializer, checker, paramSymbols, visited);
  }

  // const { id } = <init> or const [a, b] = <init>
  if (ts.isBindingElement(decl)) {
    let parent: ts.Node = decl.parent;
    while (parent && !ts.isVariableDeclaration(parent)) parent = parent.parent;
    if (parent && ts.isVariableDeclaration(parent) && parent.initializer) {
      return expressionOriginatesFromParams(parent.initializer, checker, paramSymbols, visited);
    }
  }

  return false;
}

export default defineRule({
  meta: {
    category: "security",
    description: "No Schema.parse() on Next.js Page params -- use a safe-parse-or-notFound helper",
  },
  check(ctx) {
    const { sourceFile, checker } = ctx;
    for (const stmt of sourceFile.statements) {
      if (!ts.isFunctionDeclaration(stmt) || !stmt.body) continue;
      const isDefaultExport = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      if (!isDefaultExport) continue;
      if (!isNextJsPageFunction(stmt, checker)) continue;
      const propsParam = stmt.parameters[0];
      if (!propsParam) continue;
      const paramSymbols = collectPageParamSymbols(propsParam, checker);
      if (paramSymbols.size === 0) continue;

      function visit(node: ts.Node): void {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "parse" &&
          isZodSchemaReceiver(node.expression.expression, checker)
        ) {
          const arg = node.arguments[0];
          if (arg && expressionOriginatesFromParams(arg, checker, paramSymbols, new Set())) {
            ctx.reportAt(
              node,
              "Use a safe-parse helper that returns notFound() instead of Schema.parse() on page params -- .parse() crashes the page on invalid URL input",
              {
                action: "use-safe-parse-or-not-found",
                pattern:
                  "Use safeParse then notFound() on failure",
              },
            );
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(stmt.body);
    }
  },
});
