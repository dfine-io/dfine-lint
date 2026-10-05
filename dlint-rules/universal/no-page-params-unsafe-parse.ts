// Blocks a throwing Zod parse of Next.js page params: invalid URL input must reach notFound(), not a 500.
// Zod and Promise.all resolve through resolveCallee; the params origin follows symbols transitively.
import ts from "typescript";
import { defineRule, resolveCallee } from "@dfine-io-gmbh/dlint";

const THROWING_PARSE_NAMES = new Set(["parse", "parseAsync"]);

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

// The input a throwing zod parse reads: schema.parse(x) reads x, the exported z.parse(schema, x) reads its 2nd argument
function throwingParseInput(node: ts.CallExpression, checker: ts.TypeChecker): ts.Expression | undefined {
  const callee = resolveCallee(node, checker);
  if (callee?.packageName !== "zod" || !THROWING_PARSE_NAMES.has(callee.name)) return undefined;
  return callee.symbol.flags & ts.SymbolFlags.Variable ? node.arguments[1] : node.arguments[0];
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
    const callee = resolveCallee(unwrapped, checker);
    if (callee?.lib && callee.name === "all") {
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
        if (ts.isCallExpression(node)) {
          const arg = throwingParseInput(node, checker);
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
